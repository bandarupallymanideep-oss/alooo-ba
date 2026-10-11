"""Persistence for detected accidents.

Every accident produces three files in ``backend/detected_accidents``::

    accidentN.mp4   annotated accident footage (H.264)
    accidentN.jpg   annotated snapshot of the first confirmed frame
    accidentN.json  metadata (camera, time, class, confidence, status ...)

Names are reserved atomically (O_CREAT | O_EXCL), so an existing accident file
is never overwritten - even if two sessions or processes detect at once.
"""
import json
import os
import re
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from sadarakshak.constant.application import DETECTED_ACCIDENTS_DIR
from sadarakshak.components.categories import category_for, category_label
from sadarakshak.logger import logging

ACCIDENT_ID_RE = re.compile(r"^accident(\d+)$")
ALLOWED_STATUSES = {"New", "Acknowledged", "Resolved"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class AccidentStore:
    def __init__(self, directory: Path = DETECTED_ACCIDENTS_DIR):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.deleted_dir = self.dir / "deleted"  # deleted alerts are moved here (recoverable evidence)
        self._lock = threading.Lock()

    # ------------------------------------------------------------ paths
    def clip_path(self, accident_id: str) -> Path:
        return self.dir / f"{accident_id}.mp4"

    def snapshot_path(self, accident_id: str) -> Path:
        return self.dir / f"{accident_id}.jpg"

    def meta_path(self, accident_id: str) -> Path:
        return self.dir / f"{accident_id}.json"

    @staticmethod
    def is_valid_id(accident_id: str) -> bool:
        return bool(ACCIDENT_ID_RE.match(accident_id or ""))

    # ------------------------------------------------------------ reservation
    def _max_used_number(self) -> int:
        nums = [-1]
        for folder in (self.dir, self.deleted_dir):
            if folder.exists():
                for p in folder.iterdir():
                    m = re.match(r"accident(\d+)", p.name)
                    if m:
                        nums.append(int(m.group(1)))
        return max(nums)

    def reserve_id(self) -> str:
        """Reserve the next ``accidentN`` name by atomically creating its .mp4.

        Numbers are never reused (also not after a deletion) so an id always
        identifies exactly one accident.
        """
        with self._lock:
            n = self._max_used_number() + 1
            while True:
                accident_id = f"accident{n}"
                if not self.meta_path(accident_id).exists():
                    try:
                        fd = os.open(self.clip_path(accident_id), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                        os.close(fd)
                        return accident_id
                    except FileExistsError:
                        pass
                n += 1

    # ------------------------------------------------------------ read / write
    def save(self, record: Dict) -> Dict:
        accident_id = record["id"]
        path = self.meta_path(accident_id)
        tmp = path.with_suffix(".json.tmp")
        with self._lock:
            tmp.write_text(json.dumps(record, indent=2), encoding="utf-8")
            os.replace(tmp, path)
        return record

    def get(self, accident_id: str) -> Optional[Dict]:
        if not self.is_valid_id(accident_id):
            return None
        path = self.meta_path(accident_id)
        if not path.exists():
            return None
        try:
            rec = json.loads(path.read_text(encoding="utf-8"))
            if not rec.get("category"):  # records created before categories existed
                rec["category"] = category_for(rec.get("accidentType", ""))
                rec["categoryLabel"] = category_label(rec["category"])
            return rec
        except Exception as e:
            logging.error(f"Corrupt accident metadata {path.name}: {e}")
            return None

    def list(self) -> List[Dict]:
        records = []
        for path in self.dir.glob("accident*.json"):
            if not self.is_valid_id(path.stem):
                continue
            rec = self.get(path.stem)
            if rec:
                records.append(rec)
        records.sort(key=lambda r: (r.get("timestamp", ""), int(ACCIDENT_ID_RE.match(r["id"]).group(1))),
                     reverse=True)
        return records

    def update(self, accident_id: str, status: Optional[str] = None, notes: Optional[str] = None,
               operator: Optional[str] = None) -> Optional[Dict]:
        rec = self.get(accident_id)
        if rec is None:
            return None
        if status is not None:
            if status not in ALLOWED_STATUSES:
                raise ValueError(f"Invalid status '{status}'. Allowed: {sorted(ALLOWED_STATUSES)}")
            rec["status"] = status
            now = utc_now_iso()
            if status == "Acknowledged":
                rec["acknowledgedAt"] = now
                rec["acknowledgedBy"] = operator or "Operator"
            elif status == "Resolved":
                rec["resolvedAt"] = now
                rec["resolvedBy"] = operator or "Operator"
        if notes is not None:
            rec["notes"] = notes[:5000]
        return self.save(rec)


    def recover_interrupted(self) -> int:
        """At startup no clip can be recording: finalize records left 'recording' by a crash/restart."""
        fixed = 0
        for rec in self.list():
            if rec.get("recording"):
                clip = self.clip_path(rec["id"])
                rec.update({"recording": False, "interrupted": True, "endedAt": rec.get("endedAt") or utc_now_iso(),
                            "clipSizeBytes": clip.stat().st_size if clip.exists() else 0})
                self.save(rec)
                fixed += 1
        if fixed:
            logging.warning(f"Recovered {fixed} accident record(s) interrupted by a backend restart")
        return fixed

    def delete(self, accident_id: str) -> bool:
        """Remove an accident alert: its files are moved to detected_accidents/deleted/."""
        rec = self.get(accident_id)
        if rec is None:
            return False
        if rec.get("recording"):
            raise RuntimeError("This accident clip is still being recorded; try again when recording finishes.")
        self.deleted_dir.mkdir(exist_ok=True)
        stamp = utc_now_iso().replace(":", "").replace("-", "")
        with self._lock:
            for path in (self.clip_path(accident_id), self.snapshot_path(accident_id), self.meta_path(accident_id)):
                if path.exists():
                    shutil.move(str(path), str(self.deleted_dir / f"{path.stem}__deleted_{stamp}{path.suffix}"))
        logging.info(f"Accident {accident_id} deleted (files moved to {self.deleted_dir.name}/)")
        return True


accident_store = AccidentStore()
