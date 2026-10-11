"""Video source helpers: source resolution, credential masking and RTSP diagnostics.

``diagnose_source`` checks a source step by step so the user gets a precise
reason when it fails instead of a generic "cannot open":

    URL syntax -> DNS -> TCP connect -> RTSP DESCRIBE (+ Basic/Digest auth)
    -> SDP video track -> OpenCV/FFmpeg open -> first decoded frame

Passwords are never included in returned messages or log lines (``mask_url``).
"""
import hashlib
import os
import re
import socket
import ssl
import time
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import urlsplit, urlunsplit, unquote, parse_qsl, urlencode

import cv2

from sadarakshak.constant.application import (
    ACCIDENT_CLIPS_DIR, UPLOADS_DIR, VIDEO_EXTENSIONS,
    STREAM_OPEN_TIMEOUT_MS, STREAM_READ_TIMEOUT_MS, TCP_CONNECT_TIMEOUT_S, RTSP_HANDSHAKE_TIMEOUT_S,
    STREAM_DECODER_THREADS,
)
from sadarakshak.logger import logging

STREAM_SCHEMES = {"rtsp", "rtsps", "rtmp", "http", "https"}
DEFAULT_PORTS = {"rtsp": 554, "rtsps": 322, "rtmp": 1935, "http": 80, "https": 443}
_SECRET_QUERY_KEYS = re.compile(r"(pass|pwd|password|token|key|auth|secret)", re.I)


class SourceError(Exception):
    """A user-facing error about a video source (message is safe to display)."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


# ------------------------------------------------------------------ masking
def mask_url(url: str) -> str:
    """Hide the password (and secret query values) of a URL for display/logging."""
    if not url or "://" not in url:
        return url
    try:
        parts = urlsplit(url)
        netloc = parts.netloc
        if "@" in netloc:
            userinfo, hostport = netloc.rsplit("@", 1)
            user = userinfo.split(":", 1)[0]
            netloc = f"{user}:***@{hostport}" if ":" in userinfo else f"{user}@{hostport}"
        query = parts.query
        if query:
            query = urlencode([(k, "***" if _SECRET_QUERY_KEYS.search(k) else v)
                               for k, v in parse_qsl(query, keep_blank_values=True)], safe="*")
        return urlunsplit((parts.scheme, netloc, parts.path, query, parts.fragment))
    except Exception:
        return "<unparseable url>"


def has_credentials(url: str) -> bool:
    try:
        return bool(urlsplit(url).password) or bool(re.search(r"[?&](pass|pwd|password)=", url or "", re.I))
    except Exception:
        return False


def strip_credentials(url: str) -> Tuple[str, Optional[str], Optional[str]]:
    parts = urlsplit(url)
    user = unquote(parts.username) if parts.username else None
    pwd = unquote(parts.password) if parts.password else None
    host = parts.hostname or ""
    if ":" in host:  # IPv6
        host = f"[{host}]"
    netloc = f"{host}:{parts.port}" if parts.port else host
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, "")), user, pwd


# ------------------------------------------------------------------ source resolution
def is_stream_url(source: str) -> bool:
    return bool(source) and "://" in source and source.split("://", 1)[0].lower() in STREAM_SCHEMES


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_file_source(source: str, allow_any_path: bool = False) -> Path:
    """Map '/accident_clips/x.mp4', '/uploads/x.mp4' or a bare clip name to a local file.

    HTTP callers may only reach files inside accident_clips/ or uploads/ (no path traversal).
    """
    s = (source or "").strip().replace("\\", "/")
    candidates = []
    if s.startswith("/accident_clips/") or s.startswith("accident_clips/"):
        candidates.append(ACCIDENT_CLIPS_DIR / s.split("accident_clips/", 1)[1])
    elif s.startswith("/uploads/") or s.startswith("uploads/"):
        candidates.append(UPLOADS_DIR / s.split("uploads/", 1)[1])
    else:
        if allow_any_path:
            candidates.append(Path(source))
        name = s.split("/")[-1]
        candidates += [ACCIDENT_CLIPS_DIR / name, UPLOADS_DIR / name]
    for c in candidates:
        if not allow_any_path and not (_inside(c, ACCIDENT_CLIPS_DIR) or _inside(c, UPLOADS_DIR)):
            continue
        if c.is_file():
            if c.suffix.lower() not in VIDEO_EXTENSIONS:
                raise SourceError("UNSUPPORTED_FILE", f"'{c.name}' is not a supported video file type.")
            return c
    raise SourceError("FILE_NOT_FOUND", f"Video file not found: {s.split('/')[-1] or s}", 404)


def validate_stream_url(url: str) -> None:
    """Syntax validation of a network stream URL. Raises SourceError."""
    if not url or not url.strip():
        raise SourceError("INVALID_URL", "Please enter an RTSP URL, e.g. rtsp://192.168.1.100:554/stream")
    url = url.strip()
    if any(ch.isspace() for ch in url):
        raise SourceError("INVALID_URL", "Invalid RTSP URL: it must not contain spaces.")
    if "://" not in url:
        raise SourceError("INVALID_URL", "Invalid RTSP URL: it must start with rtsp:// (e.g. rtsp://192.168.1.100:554/stream).")
    scheme = url.split("://", 1)[0].lower()
    if scheme not in STREAM_SCHEMES:
        raise SourceError("INVALID_URL", f"Unsupported URL scheme '{scheme}://'. Use rtsp:// (or rtsps://, http://).")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise SourceError("INVALID_URL", "Invalid RTSP URL: the port number is not valid.")
    if not parts.hostname:
        raise SourceError("INVALID_URL", "Invalid RTSP URL: the camera host/IP address is missing.")
    if port is not None and not (0 < port < 65536):
        raise SourceError("INVALID_URL", "Invalid RTSP URL: the port must be between 1 and 65535.")


def open_capture(source: str) -> cv2.VideoCapture:
    """Open an OpenCV capture with connection/read timeouts for network streams."""
    if is_stream_url(source):
        params = []
        if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
            params += [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, STREAM_OPEN_TIMEOUT_MS]
        if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
            params += [cv2.CAP_PROP_READ_TIMEOUT_MSEC, STREAM_READ_TIMEOUT_MS]
        if STREAM_DECODER_THREADS > 0 and hasattr(cv2, "CAP_PROP_N_THREADS"):
            params += [cv2.CAP_PROP_N_THREADS, STREAM_DECODER_THREADS]  # avoid frame-threading delay
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG, params)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap
    return cv2.VideoCapture(str(source))


# ------------------------------------------------------------------ RTSP handshake
def _parse_auth_challenges(headers) -> Dict[str, Dict[str, str]]:
    challenges = {}
    for name, value in headers:
        if name != "www-authenticate":
            continue
        scheme, _, rest = value.partition(" ")
        params = dict(re.findall(r'(\w+)\s*=\s*"?([^",]*)"?', rest))
        challenges[scheme.lower()] = params
    return challenges


def _auth_header(challenges, method, uri, user, pwd) -> Optional[str]:
    if "digest" in challenges:
        c = challenges["digest"]
        realm, nonce = c.get("realm", ""), c.get("nonce", "")
        ha1 = hashlib.md5(f"{user}:{realm}:{pwd}".encode()).hexdigest()
        ha2 = hashlib.md5(f"{method}:{uri}".encode()).hexdigest()
        header = f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri}"'
        qop = c.get("qop", "")
        if "auth" in qop.split(","):
            cnonce, nc = hashlib.md5(str(time.time()).encode()).hexdigest()[:16], "00000001"
            resp = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2}".encode()).hexdigest()
            header += f', qop=auth, nc={nc}, cnonce="{cnonce}"'
        else:
            resp = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
        header += f', response="{resp}"'
        if c.get("opaque"):
            header += f', opaque="{c["opaque"]}"'
        return header
    if "basic" in challenges:
        import base64
        return "Basic " + base64.b64encode(f"{user}:{pwd}".encode()).decode()
    return None


def _rtsp_request(host, port, use_tls, method, uri, cseq, auth=None, timeout=RTSP_HANDSHAKE_TIMEOUT_S):
    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        if use_tls:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE  # IP cameras use self-signed certificates
            sock = ctx.wrap_socket(sock, server_hostname=host)
        lines = [f"{method} {uri} RTSP/1.0", f"CSeq: {cseq}", "User-Agent: SADARAKSHAK",
                 "Accept: application/sdp"]
        if auth:
            lines.append(f"Authorization: {auth}")
        sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        data = b""
        while b"\r\n\r\n" not in data and len(data) < 65536:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        head, _, body = data.partition(b"\r\n\r\n")
        text = head.decode("latin-1")
        status_line, *header_lines = text.split("\r\n")
        headers = []
        for hl in header_lines:
            if ":" in hl:
                k, v = hl.split(":", 1)
                headers.append((k.strip().lower(), v.strip()))
        length = next((int(v) for k, v in headers if k == "content-length" and v.isdigit()), 0)
        while len(body) < length:
            chunk = sock.recv(4096)
            if not chunk:
                break
            body += chunk
        m = re.match(r"RTSP/\d\.\d\s+(\d{3})\s*(.*)", status_line)
        if not m:
            return None, status_line[:60], headers, ""
        return int(m.group(1)), m.group(2), headers, body.decode("utf-8", "replace")
    finally:
        sock.close()


def _video_codec_from_sdp(sdp: str) -> Tuple[bool, Optional[str]]:
    has_video, codec, in_video = False, None, False
    for line in sdp.splitlines():
        if line.startswith("m="):
            in_video = line.startswith("m=video")
            has_video = has_video or in_video
        elif in_video and line.startswith("a=rtpmap:") and codec is None:
            m = re.match(r"a=rtpmap:\d+\s+([\w.-]+)", line)
            if m:
                codec = m.group(1).upper()
    return has_video, codec


def _fail(code, message, status="error", **extra):
    return {"success": False, "status": status, "code": code, "message": message, **extra}


def diagnose_source(source: str, allow_any_path: bool = False, read_frame: bool = True):
    """Test a source (RTSP/HTTP URL or local video) and explain failures.

    Returns ``(result_dict, first_frame_or_None)``. ``result_dict`` is JSON-safe and
    contains no credentials. Technical details are logged server side (masked).
    """
    started = time.time()
    source = (source or "").strip()
    safe = mask_url(source)

    # ---------------------------------------------------------- local files
    if not is_stream_url(source):
        if "://" in source:
            try:
                validate_stream_url(source)
            except SourceError as e:
                return _fail(e.code, e.message), None
        if re.match(r"^[\w.+-]+:[^\\/]", source) and not re.match(r"^[a-zA-Z]:[\\/]", source):
            return _fail("INVALID_URL", "Invalid RTSP URL: it must start with rtsp:// "
                                        "(e.g. rtsp://192.168.1.100:554/stream)."), None
        try:
            path = resolve_file_source(source, allow_any_path=allow_any_path)
        except SourceError as e:
            if not source:
                return _fail("INVALID_URL", "Please provide an RTSP URL or a video file."), None
            if e.code == "FILE_NOT_FOUND" and Path(source).suffix.lower() not in VIDEO_EXTENSIONS:
                return _fail("INVALID_URL", "Invalid RTSP URL: it must start with rtsp:// "
                                            "(e.g. rtsp://192.168.1.100:554/stream)."), None
            return _fail(e.code, e.message), None
        cap = cv2.VideoCapture(str(path))
        try:
            if not cap.isOpened():
                return _fail("UNSUPPORTED_FILE", f"'{path.name}' could not be opened (unsupported or corrupt video)."), None
            ok, frame = cap.read()
            if not ok or frame is None:
                return _fail("NO_FRAMES", f"'{path.name}' contains no readable video frames."), None
            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        finally:
            cap.release()
        h, w = frame.shape[:2]
        return {
            "success": True, "status": "online", "code": "OK", "sourceType": "file",
            "message": f"Video file '{path.name}' opened successfully",
            "resolution": f"{w}x{h}", "fps": round(fps, 1), "totalFrames": total,
            "durationSeconds": round(total / fps, 1) if fps else None,
            "elapsedMs": int((time.time() - started) * 1000),
        }, frame

    # ---------------------------------------------------------- network streams
    try:
        validate_stream_url(source)
    except SourceError as e:
        return _fail(e.code, e.message), None

    parts = urlsplit(source)
    scheme = parts.scheme.lower()
    host = parts.hostname
    port = parts.port or DEFAULT_PORTS.get(scheme, 554)
    clean_url, user, pwd = strip_credentials(source)
    codec = None
    handshake_silent = False  # server accepted TCP but did not answer our RTSP request in time

    # 1. DNS
    try:
        socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        logging.warning(f"[RTSP test] DNS failure for {safe}: {e}")
        return _fail("DNS_FAILED", f"Camera host '{host}' could not be resolved. Check the IP address / host name."), None

    # 2. TCP
    try:
        socket.create_connection((host, port), timeout=TCP_CONNECT_TIMEOUT_S).close()
    except ConnectionRefusedError as e:
        logging.warning(f"[RTSP test] Connection refused {safe}: {e}")
        return _fail("CONNECTION_REFUSED", f"Camera at {host}:{port} refused the connection. "
                                           f"Check the port and that the RTSP service is enabled."), None
    except (socket.timeout, TimeoutError) as e:
        logging.warning(f"[RTSP test] Timeout connecting {safe}: {e}")
        return _fail("TIMEOUT", f"Connection to {host}:{port} timed out after {TCP_CONNECT_TIMEOUT_S:.0f}s. "
                                f"The camera is unreachable (offline, wrong IP, or blocked by a firewall)."), None
    except OSError as e:
        logging.warning(f"[RTSP test] Unreachable {safe}: {e}")
        return _fail("UNREACHABLE", f"Camera at {host}:{port} is unreachable (network error)."), None

    # 3. RTSP handshake (DESCRIBE) - gives precise auth / path / codec errors
    if scheme in ("rtsp", "rtsps"):
        try:
            code, reason, headers, sdp = _rtsp_request(host, port, scheme == "rtsps", "DESCRIBE", clean_url, 1)
            if code is None:
                logging.warning(f"[RTSP test] Non-RTSP reply from {safe}: {reason!r}")
                return _fail("NOT_RTSP", f"{host}:{port} answered, but not with RTSP. Check the port number."), None
            if code == 401:
                if not user:
                    return _fail("AUTH_REQUIRED", "The camera requires a username and password. "
                                                  "Use rtsp://username:password@host:port/path"), None
                auth = _auth_header(_parse_auth_challenges(headers), "DESCRIBE", clean_url, user, pwd or "")
                if auth:
                    code, reason, headers, sdp = _rtsp_request(host, port, scheme == "rtsps", "DESCRIBE",
                                                               clean_url, 2, auth=auth)
                if code == 401:
                    logging.warning(f"[RTSP test] Authentication rejected for {safe}")
                    return _fail("AUTH_FAILED", "Authentication failed: the camera rejected the username or password."), None
            if code == 404:
                return _fail("STREAM_NOT_FOUND", "The camera is reachable but the stream path was not found. "
                                                 "Check the path after the port (e.g. /stream1)."), None
            if code == 403:
                return _fail("FORBIDDEN", "The camera refused access to this stream (403 Forbidden)."), None
            if code and code >= 500:
                logging.warning(f"[RTSP test] Server error {code} {reason} for {safe}")
                return _fail("CAMERA_ERROR", f"The camera reported an internal error ({code} {reason})."), None
            if code != 200:
                logging.warning(f"[RTSP test] Unexpected RTSP status {code} {reason} for {safe}")
                return _fail("RTSP_ERROR", f"The camera returned RTSP error {code} {reason}."), None
            has_video, codec = _video_codec_from_sdp(sdp)
            if sdp and not has_video:
                return _fail("UNSUPPORTED_STREAM", "The RTSP stream has no video track (audio only?)."), None
        except (socket.timeout, TimeoutError):
            # Slow devices (phones, Wi-Fi cameras) may not answer in time; the OpenCV check below is authoritative.
            handshake_silent = True
            logging.warning(f"[RTSP test] No RTSP reply within {RTSP_HANDSHAKE_TIMEOUT_S:.0f}s from {safe}; "
                            f"trying to open the stream anyway")
        except Exception as e:
            # Not fatal: fall through to the OpenCV check, which is authoritative.
            logging.warning(f"[RTSP test] Handshake check skipped for {safe}: {type(e).__name__}: {e}")

    if not read_frame:
        return {"success": True, "status": "online", "code": "OK", "sourceType": "stream",
                "message": "RTSP server reachable", "codec": codec}, None

    # 4. Open & decode with OpenCV/FFmpeg (the same path the detector uses)
    cap = open_capture(source)
    try:
        if not cap.isOpened():
            logging.warning(f"[RTSP test] OpenCV could not open {safe}")
            if handshake_silent:
                return _fail("RTSP_NO_RESPONSE", f"{host}:{port} accepted the connection but did not answer the RTSP "
                                                 f"request. Check that the streaming app/camera is running and the path is correct."), None
            return _fail("OPEN_FAILED", "Unable to connect to RTSP stream: the stream could not be opened or "
                                        "decoded (unsupported codec/transport)." +
                         (f" Stream codec: {codec}." if codec else "")), None
        frame = None
        for _ in range(5):
            ok, frame = cap.read()
            if ok and frame is not None:
                break
            frame = None
        if frame is None:
            logging.warning(f"[RTSP test] Opened but no frames from {safe}")
            return _fail("NO_FRAMES", "Connected to the stream but no video frames were received."), None
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
    finally:
        cap.release()
    h, w = frame.shape[:2]
    fps_val = round(fps, 1) if 0 < fps < 240 else None
    logging.info(f"[RTSP test] OK {safe} {w}x{h} fps={fps_val} codec={codec}")
    return {
        "success": True, "status": "online", "code": "OK", "sourceType": "stream",
        "message": "Camera stream connected successfully",
        "resolution": f"{w}x{h}", "fps": fps_val, "codec": codec,
        "elapsedMs": int((time.time() - started) * 1000),
    }, frame
