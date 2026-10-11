"""Measure real SADARAKSHAK live-stream latency (no estimates).

1. Start the test camera with timestamps burned into every frame:
       python tools\\rtsp_test_server.py --stamp
2. Start detection on rtsp://127.0.0.1:8554/stream (dashboard Quick Connect, or --start below).
3. Run:
       python tools\\measure_latency.py --session cam-3            # through the backend (what a browser receives)
       python tools\\measure_latency.py --direct rtsp://127.0.0.1:8554/stream   # RTSP + decode only

Latency = receive time - time the test camera sent the frame (same machine clock).
It covers RTSP transport, FFmpeg/OpenCV buffering and decoding, annotation, JPEG
encoding and MJPEG delivery; only the browser's paint (~1 frame) is not included.
"""
import argparse
import statistics
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

STAMP_BITS, STAMP_CELL = 40, 12


def read_stamp(frame):
    h = frame.shape[0]
    y0 = h - STAMP_CELL - 2
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    bits = []
    for i in range(STAMP_BITS + 4):
        x0 = 2 + i * STAMP_CELL
        cell = gray[y0 + 3:y0 + STAMP_CELL - 3, x0 + 3:x0 + STAMP_CELL - 3]
        bits.append(1 if cell.mean() > 127 else 0)
    data, check = bits[:STAMP_BITS], bits[STAMP_BITS:]
    if sum(b << i for i, b in enumerate(check)) != sum(data) % 16:
        return None  # stamp damaged (e.g. covered by a bounding box)
    ms = sum(b << i for i, b in enumerate(data))
    now_ms = int(time.time() * 1000)
    full = (now_ms & ~((1 << STAMP_BITS) - 1)) | ms
    if full > now_ms + 1000:
        full -= 1 << STAMP_BITS
    return full


def report(samples, label):
    if not samples:
        print(f"{label}: no stamped frames decoded (is the test server running with --stamp?)")
        return
    s = sorted(samples)
    print(f"{label}: {len(s)} frames | median {statistics.median(s):.0f} ms | "
          f"p90 {s[int(len(s) * 0.9) - 1]:.0f} ms | min {s[0]:.0f} ms | max {s[-1]:.0f} ms")


def measure_direct(url, n):
    from sadarakshak.components.stream_utils import open_capture
    cap = open_capture(url)
    lat = []
    for _ in range(n):
        ok, frame = cap.read()
        if not ok:
            break
        ts = read_stamp(frame)
        if ts:
            lat.append(time.time() * 1000 - ts)
    cap.release()
    report(lat[10:], "RTSP -> OpenCV decode (direct)")


def measure_backend(api, session, n):
    import requests
    r = requests.get(f"{api}/api/detect/sessions/{session}/stream", stream=True, timeout=15)
    buf, lat, got = b"", [], 0
    for chunk in r.iter_content(chunk_size=65536):
        buf += chunk
        while True:
            a = buf.find(b"\xff\xd8")
            b = buf.find(b"\xff\xd9", a + 2)
            if a < 0 or b < 0:
                break
            jpg, buf = buf[a:b + 2], buf[b + 2:]
            recv = time.time() * 1000
            frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
            got += 1
            ts = read_stamp(frame) if frame is not None else None
            if ts:
                lat.append(recv - ts)
        if got >= n:
            break
    r.close()
    report(lat[10:], "Camera -> backend (YOLO11 annotated) -> HTTP client")
    status = requests.get(f"{api}/api/detect/sessions/{session}", timeout=5).json()
    print("Backend-reported:", status.get("latency"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Measure SADARAKSHAK live latency")
    ap.add_argument("--session", help="detection session / camera id to measure through the backend")
    ap.add_argument("--direct", help="RTSP URL to measure without the backend")
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--frames", type=int, default=150)
    args = ap.parse_args()
    if args.direct:
        measure_direct(args.direct, args.frames)
    if args.session:
        measure_backend(args.api.rstrip("/"), args.session, args.frames)
    if not (args.direct or args.session):
        ap.print_help()
