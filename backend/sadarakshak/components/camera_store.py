"""Camera registry persisted in backend/data/cameras.json.

Real RTSP URLs (which may contain passwords) stay on the server. The API only
ever returns ``mask_url(sourceUrl)`` plus a ``hasCredentials`` flag. When the
frontend sends the masked URL back unchanged, the stored real URL is kept.
"""
import json
import os
import threading
from typing import Dict, List, Optional

from sadarakshak.components.accident_store import utc_now_iso
from sadarakshak.components.stream_utils import mask_url, has_credentials, is_stream_url
from sadarakshak.constant.application import DATA_DIR, ACCIDENT_CLIPS_DIR

CAMERAS_FILE = DATA_DIR / "cameras.json"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

EDITABLE_FIELDS = {"name", "location", "latitude", "longitude", "sourceType", "sourceUrl", "fileName", "autoStart"}


class CameraStore:
    def __init__(self, path=CAMERAS_FILE):
        self.path = path
        self._lock = threading.Lock()
        if not self.path.exists():
            self._seed()

    def _seed(self):
        """First run: register the bundled sample clip so the dashboard is usable immediately."""
        cams = []
        sample = sorted(ACCIDENT_CLIPS_DIR.glob("*.mp4"))
        if sample:
            cams.append({
                "id": "cam-1", "name": f"Sample Clip - {sample[0].name}", "location": "Test footage (accident_clips)",
                "latitude": None, "longitude": None, "sourceType": "upload",
                "sourceUrl": f"/accident_clips/{sample[0].name}", "fileName": sample[0].name,
                "autoStart": False, "createdAt": utc_now_iso(), "updatedAt": utc_now_iso(),
            })
        self._write(cams)

    def _read(self) -> List[Dict]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _write(self, cams: List[Dict]):
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(cams, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)

    # ------------------------------------------------------------ CRUD (internal, unmasked)
    def list(self) -> List[Dict]:
        with self._lock:
            return self._read()

    def get(self, camera_id: str) -> Optional[Dict]:
        return next((c for c in self.list() if c["id"] == camera_id), None)

    def create(self, data: Dict) -> Dict:
        with self._lock:
            cams = self._read()
            nums = [int(c["id"].split("-")[1]) for c in cams if c["id"].startswith("cam-") and c["id"][4:].isdigit()]
            cam = {k: data.get(k) for k in EDITABLE_FIELDS}
            cam.update({"id": f"cam-{max(nums, default=0) + 1}", "createdAt": utc_now_iso(), "updatedAt": utc_now_iso()})
            cam["autoStart"] = bool(cam.get("autoStart"))
            cams.append(cam)
            self._write(cams)
            return cam

    def update(self, camera_id: str, data: Dict) -> Optional[Dict]:
        with self._lock:
            cams = self._read()
            for cam in cams:
                if cam["id"] != camera_id:
                    continue
                for k, v in data.items():
                    if k not in EDITABLE_FIELDS:
                        continue
                    if k == "sourceUrl" and v and cam.get("sourceUrl") and v == mask_url(cam["sourceUrl"]):
                        continue  # masked URL sent back unchanged -> keep the real one
                    cam[k] = v
                cam["updatedAt"] = utc_now_iso()
                self._write(cams)
                return cam
        return None

    def set_fields(self, camera_id: str, **fields):
        with self._lock:
            cams = self._read()
            for cam in cams:
                if cam["id"] == camera_id:
                    cam.update(fields)
                    self._write(cams)
                    return cam
        return None

    def delete(self, camera_id: str) -> bool:
        with self._lock:
            cams = self._read()
            remaining = [c for c in cams if c["id"] != camera_id]
            if len(remaining) == len(cams):
                return False
            self._write(remaining)
        (THUMBNAILS_DIR / f"{camera_id}.jpg").unlink(missing_ok=True)
        return True

    # ------------------------------------------------------------ public view
    @staticmethod
    def thumbnail_path(camera_id: str):
        return THUMBNAILS_DIR / f"{camera_id}.jpg"

    def public(self, cam: Dict, session_status: Optional[Dict] = None) -> Dict:
        src = cam.get("sourceUrl") or ""
        last_test = cam.get("lastTest") or {}
        active = bool(session_status and session_status.get("active"))
        status = "Processing" if active else ("Connected" if last_test.get("success") else "Offline")
        thumb = self.thumbnail_path(cam["id"])
        return {
            "id": cam["id"],
            "name": cam.get("name") or cam["id"],
            "location": cam.get("location") or "",
            "latitude": cam.get("latitude"),
            "longitude": cam.get("longitude"),
            "sourceType": cam.get("sourceType") or ("rtsp" if is_stream_url(src) else "upload"),
            "sourceUrl": mask_url(src),
            "hasCredentials": has_credentials(src),
            "fileName": cam.get("fileName"),
            "autoStart": bool(cam.get("autoStart")),
            "status": status,
            "fps": (session_status or {}).get("sourceFps") or last_test.get("fps") or 0,
            "resolution": (session_status or {}).get("resolution") or last_test.get("resolution") or "Unknown",
            "thumbnailUrl": f"/api/cameras/{cam['id']}/thumbnail?v={int(thumb.stat().st_mtime)}" if thumb.exists() else None,
            "lastTest": last_test or None,
            "detection": session_status,
            "createdAt": cam.get("createdAt"),
            "updatedAt": cam.get("updatedAt"),
        }


camera_store = CameraStore()
