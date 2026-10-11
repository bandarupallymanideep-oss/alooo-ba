"""SADARAKSHAK RTSP test camera - simulates an IP/CCTV camera from a video file.

No FFmpeg or MediaMTX needed: frames are encoded to H.264 with PyAV (libx264)
and sent as RTP over RTSP-interleaved TCP (what OpenCV/FFmpeg clients use with
rtsp_transport=tcp). Supports optional Digest authentication so the backend's
"authentication failed" handling can be tested.

Usage (from backend/):
    venv\\Scripts\\python tools\\rtsp_test_server.py
    venv\\Scripts\\python tools\\rtsp_test_server.py --video accident_clips\\accident.mp4 --port 8554 --path /stream
    venv\\Scripts\\python tools\\rtsp_test_server.py --user admin --password test123

Then use:  rtsp://127.0.0.1:8554/stream   (or rtsp://admin:test123@127.0.0.1:8554/stream)
"""
import argparse
import hashlib
import os
import random
import re
import socket
import struct
import threading
import time
from fractions import Fraction
from urllib.parse import urlsplit

import av
import cv2

REALM = "SADARAKSHAK-TestCam"

STAMP_BITS, STAMP_CELL = 40, 12  # latency stamp: 40-bit ms clock + 4-bit checksum, 12x12 px cells


def stamp_frame(frame, t: float):
    """Burn the send time into the bottom-left corner as black/white cells (read by measure_latency.py)."""
    ms = int(t * 1000) & ((1 << STAMP_BITS) - 1)
    bits = [(ms >> i) & 1 for i in range(STAMP_BITS)]
    bits += [(sum(bits) >> i) & 1 for i in range(4)]
    h = frame.shape[0]
    y0 = h - STAMP_CELL - 2
    frame[y0 - 2:h, 0:(len(bits) * STAMP_CELL) + 4] = 128
    for i, b in enumerate(bits):
        x0 = 2 + i * STAMP_CELL
        frame[y0:y0 + STAMP_CELL, x0:x0 + STAMP_CELL] = 255 if b else 0


def split_nals(data: bytes):
    """Split an Annex-B byte stream into NAL units (without start codes)."""
    starts = [m.start() for m in re.finditer(b"\x00\x00\x01", data)]
    nals = []
    for i, s in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(data)
        nal = data[s + 3:end]
        if i + 1 < len(starts) and nal.endswith(b"\x00"):
            nal = nal.rstrip(b"\x00")  # 4-byte start code of the next NAL
        if nal:
            nals.append(nal)
    return nals


class ClientHandler(threading.Thread):
    def __init__(self, conn, addr, args):
        super().__init__(daemon=True)
        self.conn, self.addr, self.args = conn, addr, args
        self.send_lock = threading.Lock()
        self.playing = threading.Event()
        self.closed = threading.Event()
        self.nonce = hashlib.md5(os.urandom(16)).hexdigest()
        self.session = str(random.randint(10 ** 7, 10 ** 8 - 1))

    # ------------------------------------------------------------ RTSP
    def send(self, data: bytes):
        with self.send_lock:
            self.conn.sendall(data)

    def reply(self, cseq, code=200, reason="OK", headers=None, body=b""):
        lines = [f"RTSP/1.0 {code} {reason}", f"CSeq: {cseq}", "Server: SADARAKSHAK-TestCam"]
        for k, v in (headers or {}).items():
            lines.append(f"{k}: {v}")
        if body:
            lines.append(f"Content-Length: {len(body)}")
        self.send(("\r\n".join(lines) + "\r\n\r\n").encode() + body)

    def authorized(self, method, headers) -> bool:
        if not self.args.user:
            return True
        auth = headers.get("authorization", "")
        if not auth.lower().startswith("digest"):
            return False
        p = dict(re.findall(r'(\w+)="?([^",]*)"?', auth))
        ha1 = hashlib.md5(f"{self.args.user}:{REALM}:{self.args.password}".encode()).hexdigest()
        ha2 = hashlib.md5(f"{method}:{p.get('uri', '')}".encode()).hexdigest()
        if p.get("qop"):
            expected = hashlib.md5(f"{ha1}:{p.get('nonce')}:{p.get('nc')}:{p.get('cnonce')}:{p.get('qop')}:{ha2}".encode()).hexdigest()
        else:
            expected = hashlib.md5(f"{ha1}:{p.get('nonce')}:{ha2}".encode()).hexdigest()
        return p.get("username") == self.args.user and p.get("response") == expected

    def read_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.conn.recv(n - len(buf))
            if not chunk:
                raise ConnectionError
            buf += chunk
        return buf

    def run(self):
        buf = b""
        try:
            while not self.closed.is_set():
                if buf.startswith(b"$"):  # interleaved RTCP from the client - skip
                    while len(buf) < 4:
                        buf += self.conn.recv(4096) or b""
                    length = struct.unpack(">H", buf[2:4])[0]
                    while len(buf) < 4 + length:
                        chunk = self.conn.recv(4096)
                        if not chunk:
                            raise ConnectionError
                        buf += chunk
                    buf = buf[4 + length:]
                    continue
                if b"\r\n\r\n" not in buf:
                    chunk = self.conn.recv(4096)
                    if not chunk:
                        break
                    buf += chunk
                    continue
                head, buf = buf.split(b"\r\n\r\n", 1)
                lines = head.decode("latin-1").split("\r\n")
                method, url, _ = (lines[0].split(" ") + ["", "", ""])[:3]
                headers = {}
                for l in lines[1:]:
                    if ":" in l:
                        k, v = l.split(":", 1)
                        headers[k.strip().lower()] = v.strip()
                length = int(headers.get("content-length", "0") or 0)
                while len(buf) < length:
                    buf += self.conn.recv(4096)
                buf = buf[length:]
                self.handle(method, url, headers)
        except (ConnectionError, OSError):
            pass
        finally:
            self.closed.set()
            try:
                self.conn.close()
            except OSError:
                pass
            print(f"[rtsp] client {self.addr[0]}:{self.addr[1]} disconnected")

    def handle(self, method, url, headers):
        cseq = headers.get("cseq", "0")
        print(f"[rtsp] {self.addr[0]} {method} {url}")
        if method == "OPTIONS":
            return self.reply(cseq, headers={"Public": "OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN, GET_PARAMETER"})
        if method in ("DESCRIBE", "SETUP", "PLAY") and not self.authorized(method, headers):
            return self.reply(cseq, 401, "Unauthorized",
                              {"WWW-Authenticate": f'Digest realm="{REALM}", nonce="{self.nonce}"'})
        path = urlsplit(url).path.rstrip("/")
        base_path = self.args.path.rstrip("/")
        if method in ("DESCRIBE", "SETUP", "PLAY") and not (path == base_path or path.startswith(base_path + "/")):
            return self.reply(cseq, 404, "Stream Not Found")
        if method == "DESCRIBE":
            sdp = ("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=SADARAKSHAK Test Camera\r\nc=IN IP4 0.0.0.0\r\nt=0 0\r\n"
                   "m=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=fmtp:96 packetization-mode=1\r\n"
                   "a=control:trackID=0\r\n").encode()
            return self.reply(cseq, headers={"Content-Base": url.rstrip("/") + "/", "Content-Type": "application/sdp"}, body=sdp)
        if method == "SETUP":
            transport = headers.get("transport", "")
            if "TCP" not in transport.upper():
                return self.reply(cseq, 461, "Unsupported Transport")
            return self.reply(cseq, headers={"Transport": "RTP/AVP/TCP;unicast;interleaved=0-1",
                                             "Session": f"{self.session};timeout=60"})
        if method == "PLAY":
            self.reply(cseq, headers={"Session": self.session, "Range": "npt=0.000-"})
            if not self.playing.is_set():
                self.playing.set()
                threading.Thread(target=self.stream, daemon=True).start()
            return
        if method == "GET_PARAMETER":
            return self.reply(cseq, headers={"Session": self.session})
        if method == "TEARDOWN":
            self.reply(cseq, headers={"Session": self.session})
            self.closed.set()
            return
        return self.reply(cseq, 405, "Method Not Allowed")

    # ------------------------------------------------------------ RTP / H.264
    def stream(self):
        cap = cv2.VideoCapture(self.args.video)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) // 2 * 2
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) // 2 * 2
        enc = av.CodecContext.create("libx264", "w")
        enc.width, enc.height, enc.pix_fmt = w, h, "yuv420p"
        enc.time_base = Fraction(1, 90000)
        enc.framerate = Fraction(fps).limit_denominator(1001)
        enc.options = {"preset": "ultrafast", "tune": "zerolatency", "profile": "baseline",
                       "x264-params": f"repeat-headers=1:keyint={int(fps)}:bframes=0"}
        seq, ssrc = random.randint(0, 65535), random.getrandbits(32)
        start, n = time.time(), 0
        try:
            while not self.closed.is_set():
                ok, frame = cap.read()
                if not ok:
                    if self.args.no_loop:
                        break
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                if frame.shape[1] != w or frame.shape[0] != h:
                    frame = cv2.resize(frame, (w, h))
                if self.args.stamp:
                    stamp_frame(frame, time.time())
                vf = av.VideoFrame.from_ndarray(frame, format="bgr24")
                vf.pts = int(n * 90000 / fps)
                ts = vf.pts & 0xFFFFFFFF
                for pkt in enc.encode(vf):
                    nals = split_nals(bytes(pkt))
                    for i, nal in enumerate(nals):
                        last = i == len(nals) - 1
                        for payload, marker in self.packetize(nal, last):
                            hdr = struct.pack(">BBHII", 0x80, (0x80 if marker else 0) | 96, seq & 0xFFFF, ts, ssrc)
                            rtp = hdr + payload
                            self.send(b"$\x00" + struct.pack(">H", len(rtp)) + rtp)
                            seq += 1
                n += 1
                delay = start + n / fps - time.time()
                if delay > 0:
                    time.sleep(delay)
        except (OSError, ConnectionError):
            pass
        finally:
            cap.release()
            self.closed.set()

    @staticmethod
    def packetize(nal: bytes, last_nal: bool, mtu: int = 1400):
        if len(nal) <= mtu:
            yield nal, last_nal
            return
        indicator = (nal[0] & 0xE0) | 28
        nal_type = nal[0] & 0x1F
        data = nal[1:]
        chunks = [data[i:i + mtu] for i in range(0, len(data), mtu)]
        for i, chunk in enumerate(chunks):
            s = 0x80 if i == 0 else 0
            e = 0x40 if i == len(chunks) - 1 else 0
            yield bytes([indicator, s | e | nal_type]) + chunk, (last_nal and e != 0)


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description="SADARAKSHAK RTSP test camera")
    ap.add_argument("--video", default=os.path.join(here, "accident_clips", "accident.mp4"))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8554)
    ap.add_argument("--path", default="/stream")
    ap.add_argument("--user", default=None)
    ap.add_argument("--password", default="")
    ap.add_argument("--no-loop", action="store_true", help="stop the stream at the end of the video")
    ap.add_argument("--stamp", action="store_true", help="burn send timestamps into frames (for tools/measure_latency.py)")
    args = ap.parse_args()
    if not os.path.exists(args.video):
        raise SystemExit(f"Video not found: {args.video}")
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((args.host, args.port))
    srv.listen(8)
    auth = f"{args.user}:***@" if args.user else ""
    print(f"[rtsp] SADARAKSHAK test camera streaming {os.path.basename(args.video)}")
    print(f"[rtsp] URL: rtsp://{auth}{args.host}:{args.port}{args.path}  (Ctrl+C to stop)")
    try:
        while True:
            conn, addr = srv.accept()
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            print(f"[rtsp] client connected {addr[0]}:{addr[1]}")
            ClientHandler(conn, addr, args).start()
    except KeyboardInterrupt:
        pass
    finally:
        srv.close()


if __name__ == "__main__":
    main()
