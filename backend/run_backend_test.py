"""SADARAKSHAK backend test runner.

Tests the complete detection pipeline with:
  A) an existing accident video from backend/accident_clips
  B) a user-provided RTSP link (connection test + live detection)
  C) a user-uploaded video (through the running FastAPI backend)

Usage (from backend/, with the venv active):
    python run_backend_test.py                              # model + accident.mp4 + invalid RTSP + API checks
    python run_backend_test.py accident.mp4                 # choose a clip from accident_clips/
    python run_backend_test.py --max-frames 900             # quicker run on the first 900 frames
    python run_backend_test.py --rtsp rtsp://192.168.1.100:554/stream --rtsp-seconds 30
    python run_backend_test.py --upload C:\\videos\\crash.mp4   # needs the backend running (uvicorn)
    python run_backend_test.py --skip-video --rtsp rtsp://127.0.0.1:8554/stream

A local RTSP camera for testing without real hardware:
    python tools\\rtsp_test_server.py        ->  rtsp://127.0.0.1:8554/stream
"""
import argparse
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

from sadarakshak.constant.application import ACCIDENT_CLIPS_DIR, DETECTED_ACCIDENTS_DIR, MODEL_PATH, CONFIDENCE_THRESHOLD  # noqa: E402
from sadarakshak.components.stream_utils import diagnose_source, mask_url  # noqa: E402

RESULTS = []  # (name, status, detail)


def record(name, status, detail=""):
    RESULTS.append((name, status, detail))
    icon = {"PASS": "[PASS]", "FAIL": "[FAIL]", "SKIP": "[SKIP]", "INFO": "[INFO]"}[status]
    print(f"{icon} {name}" + (f" - {detail}" if detail else ""))


def header(title):
    print("\n" + "=" * 70 + f"\n {title}\n" + "=" * 70)


def check_h264(path: Path):
    try:
        import av
        with av.open(str(path)) as c:
            s = c.streams.video[0]
            return s.codec_context.name, s.frames, round(float(c.duration or 0) / 1e6, 2)
    except Exception as e:
        return f"unreadable ({e})", 0, 0


# ---------------------------------------------------------------------------- 1-3 model
def test_model():
    header("1. MODEL")
    from sadarakshak.components.model_trainer import ModelTrainer
    from sadarakshak.components.accident_detector import ACCIDENT_CLASS_IDS
    t = time.time()
    mt = ModelTrainer()
    record("Model loads", "PASS", f"{MODEL_PATH.name} on {mt.device} in {time.time() - t:.1f}s")
    names = mt.class_names
    acc = {i: n for i, n in names.items() if "accident" in n}
    ok = set(acc) == ACCIDENT_CLASS_IDS
    record("Accident classes match model", "PASS" if ok else "FAIL",
           f"{len(names)} classes; accident ids {sorted(acc)}; threshold {CONFIDENCE_THRESHOLD}")
    print("     classes:", names)
    return mt


# ---------------------------------------------------------------------------- A) existing video
def test_video(mt, video_arg, stride, max_frames, save_full):
    header("2. EXISTING ACCIDENT VIDEO (backend/accident_clips)")
    video = Path(video_arg)
    if not video.exists():
        video = ACCIDENT_CLIPS_DIR / video_arg
    result, frame = diagnose_source(str(video), allow_any_path=True)
    if not result["success"]:
        record("Video opens", "FAIL", result["message"])
        return
    record("Video opens", "PASS", f"{video.name} {result['resolution']} @ {result['fps']} fps, "
                                  f"{result.get('totalFrames')} frames")

    boxes, class_ids, confs = mt.detect_objects(frame)
    record("YOLO inference runs", "PASS", f"{len(boxes)} object(s) on the first frame")

    from sadarakshak.pipeline.training_pipeline import TrainingPipeline
    pipe = TrainingPipeline(model_trainer=mt)
    before = set(p.name for p in DETECTED_ACCIDENTS_DIR.glob("accident*.mp4"))
    output = BASE / "output_annotated.mp4"
    print(f"     running detection (YOLO every {stride} frame(s){', max ' + str(max_frames) + ' frames' if max_frames else ''})...")

    def progress(done, total):
        if done % 300 == 0:
            print(f"     ... {done}/{total or '?'} frames")

    res = pipe.process_video(str(video), output_path=output, save_annotated=save_full,
                             camera={"id": "test-runner", "name": f"Test: {video.name}", "location": "run_backend_test.py"},
                             detect_every=stride, max_frames=max_frames, progress_cb=progress)
    record("Detection pipeline completed", "PASS",
           f"{res['total_frames']} frames, {res['inferences']} inferences, {res['processing_seconds']}s")
    accidents = res["accidents"]
    record("Accident detected", "PASS" if accidents else "FAIL",
           f"{len(accidents)} accident event(s)" if accidents else "no accident found in this video")
    for a in accidents:
        codec, frames, dur = check_h264(DETECTED_ACCIDENTS_DIR / a["clipFile"])
        ok = codec == "h264" and frames > 0
        record(f"Accident footage saved: {a['clipFile']}", "PASS" if ok else "FAIL",
               f"{a['collisionType']} {a['confidenceScore']}% at {a['videoOffsetSeconds']}s, "
               f"{dur}s {codec}, snapshot {a['id']}.jpg")
    after = set(p.name for p in DETECTED_ACCIDENTS_DIR.glob("accident*.mp4"))
    overwritten = [a["clipFile"] for a in accidents if a["clipFile"] in before]
    record("No existing accident file overwritten", "PASS" if not overwritten and len(after) >= len(before) else "FAIL",
           f"{len(before)} before -> {len(after)} after")
    record("Original test video untouched", "PASS" if video.exists() else "FAIL", str(video))
    if save_full:
        codec, frames, dur = check_h264(output)
        record("Full annotated output video", "PASS" if frames else "FAIL", f"{output.name}: {frames} frames, {codec}")


# ---------------------------------------------------------------------------- B) RTSP
def test_invalid_rtsp():
    header("3. INVALID RTSP URLS (must fail safely with a useful message)")
    cases = [
        ("missing scheme", "192.168.1.100:554/stream"),
        ("wrong scheme", "ftp://192.168.1.100/stream"),
        ("missing host", "rtsp://"),
        ("bad port", "rtsp://127.0.0.1:99999/stream"),
        ("port closed", "rtsp://127.0.0.1:1/stream"),
        ("password masked", "rtsp://admin:S3cretPass@127.0.0.1:1/stream"),
    ]
    for label, url in cases:
        try:
            result, _ = diagnose_source(url)
            ok = not result["success"] and result.get("code") not in (None, "OK") and "S3cretPass" not in result["message"]
            record(f"Invalid RTSP ({label})", "PASS" if ok else "FAIL", f"{result.get('code')}: {result['message']}")
        except Exception as e:
            record(f"Invalid RTSP ({label})", "FAIL", f"crashed: {e!r}")


def test_rtsp(mt, url, seconds):
    header(f"4. RTSP STREAM {mask_url(url)}")
    t = time.time()
    result, _ = diagnose_source(url)
    if not result["success"]:
        record("RTSP connection", "FAIL", f"{result['code']}: {result['message']}")
        return
    record("RTSP connection", "PASS", f"{result['resolution']} @ {result.get('fps')} fps, codec {result.get('codec')}, "
                                      f"{time.time() - t:.1f}s")
    from sadarakshak.pipeline.detection_session import DetectionSession
    s = DetectionSession("test-rtsp", url, mt, camera={"id": "test-rtsp", "name": "RTSP test", "location": "run_backend_test.py"})
    s.start()
    states = []
    end = time.time() + seconds
    while time.time() < end and s.state not in ("error", "disconnected"):
        time.sleep(2)
        st = s.status()
        states.append(st["state"])
        print(f"     {st['state']:<12} frames={st['framesProcessed']:<5} capture={st['captureFps']:<5} "
              f"yolo={st['inferenceFps']}/s accident_now={st['accidentInFrame']} saved={st['accidentIds']}")
    s.stop()
    s.join(timeout=10)
    st = s.status()
    record("Live YOLO detection on RTSP frames", "PASS" if st["inferences"] > 0 else "FAIL",
           f"{st['framesProcessed']} frames, {st['inferences']} inferences, states seen: {sorted(set(states))}")
    record("Accidents saved from RTSP", "PASS" if st["accidentIds"] else "INFO",
           ", ".join(st["accidentIds"]) or "no accident occurred during the test window")


# ---------------------------------------------------------------------------- C) API / upload
def test_api(api, upload, upload_timeout):
    header(f"5. BACKEND API {api}")
    try:
        import requests
    except ImportError:
        record("Backend API", "SKIP", "requests not installed")
        return
    try:
        h = requests.get(f"{api}/health", timeout=5).json()
    except Exception:
        record("Backend API", "SKIP", "backend not running - start it with: python -m uvicorn app:app --port 8000")
        return
    record("GET /health", "PASS" if h.get("status") == "ok" else "FAIL", f"{h.get('app')} model={h.get('model', {}).get('type')}")
    clips = requests.get(f"{api}/api/accident-clips", timeout=10).json()
    record("GET /api/accident-clips", "PASS", f"{clips['count']} clip(s)")
    r = requests.post(f"{api}/api/cctv/test-connection", json={"rtsp_url": "rtsp://"}, timeout=30).json()
    record("POST /api/cctv/test-connection (invalid)", "PASS" if r.get("success") is False else "FAIL", r.get("message"))
    acc = requests.get(f"{api}/api/accidents", timeout=10).json()
    record("GET /api/accidents", "PASS", f"{acc['count']} accident record(s)")
    if acc["accidents"]:
        a = acc["accidents"][0]
        head = requests.get(f"{api}{a['videoClipUrl']}", headers={"Range": "bytes=0-99"}, timeout=10)
        record("Accident video served by backend", "PASS" if head.status_code in (200, 206) else "FAIL",
               f"{a['videoClipUrl']} -> {head.status_code} {head.headers.get('content-type')}")

    if not upload:
        record("Video upload via API", "SKIP", "pass --upload <file> to test")
        return
    path = Path(upload)
    if not path.exists():
        record("Video upload via API", "FAIL", f"file not found: {path}")
        return
    with open(path, "rb") as f:
        r = requests.post(f"{api}/api/detect/video", files={"file": (path.name, f, "video/mp4")},
                          data={"camera_name": f"Upload test: {path.name}"}, timeout=300)
    body = r.json()
    if not body.get("success"):
        record("Video upload via API", "FAIL", body.get("message"))
        return
    sid = body["session"]["id"]
    record("Video upload via API", "PASS", f"stored as {body['upload']['filename']}, session {sid}")
    end = time.time() + upload_timeout
    st = {}
    while time.time() < end:
        time.sleep(3)
        st = requests.get(f"{api}/api/detect/sessions/{sid}", timeout=10).json()
        print(f"     {st['state']:<10} progress={round((st.get('progress') or 0) * 100)}% saved={st['accidentIds']}")
        if not st.get("active"):
            break
    if st.get("active"):
        requests.post(f"{api}/api/detect/sessions/{sid}/stop", timeout=10)
    record("Uploaded video processed", "PASS" if st.get("inferences") else "FAIL",
           f"state={st.get('state')}, accidents={st.get('accidentIds')}")


def main():
    ap = argparse.ArgumentParser(description="SADARAKSHAK backend test")
    ap.add_argument("video", nargs="?", default="accident.mp4", help="clip in accident_clips/ or a path")
    ap.add_argument("--stride", type=int, default=2, help="run YOLO every N frames (1 = every frame)")
    ap.add_argument("--max-frames", type=int, default=None, help="only process the first N frames")
    ap.add_argument("--no-full-output", action="store_true", help="do not write output_annotated.mp4")
    ap.add_argument("--skip-video", action="store_true")
    ap.add_argument("--rtsp", default=None, help="RTSP URL to test (e.g. rtsp://127.0.0.1:8554/stream)")
    ap.add_argument("--rtsp-seconds", type=int, default=30)
    ap.add_argument("--upload", default=None, help="video file to upload to the running backend")
    ap.add_argument("--upload-timeout", type=int, default=180)
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()

    print("=" * 70)
    print("      SADARAKSHAK BACKEND TEST - Real-Time Road Accident Detection")
    print("=" * 70)
    print(f"Model:            {MODEL_PATH}")
    print(f"Test videos:      {ACCIDENT_CLIPS_DIR}")
    print(f"Accident output:  {DETECTED_ACCIDENTS_DIR}")

    mt = test_model()
    if not args.skip_video:
        test_video(mt, args.video, args.stride, args.max_frames, not args.no_full_output)
    test_invalid_rtsp()
    if args.rtsp:
        test_rtsp(mt, args.rtsp, args.rtsp_seconds)
    else:
        header("4. RTSP STREAM")
        record("Live RTSP detection", "SKIP", "pass --rtsp <url>  (local simulator: python tools\\rtsp_test_server.py)")
    test_api(args.api.rstrip("/"), args.upload, args.upload_timeout)

    header("SUMMARY")
    counts = {k: sum(1 for r in RESULTS if r[1] == k) for k in ("PASS", "FAIL", "SKIP", "INFO")}
    print(f" PASS: {counts['PASS']}   FAIL: {counts['FAIL']}   SKIP: {counts['SKIP']}   INFO: {counts['INFO']}")
    for name, status, detail in RESULTS:
        if status == "FAIL":
            print(f"  FAILED: {name} - {detail}")
    print("=" * 70)
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
