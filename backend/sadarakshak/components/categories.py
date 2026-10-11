"""Accident categories for Alerts & Violations.

A category is derived from the YOLO class name ``<a>_<b>_accident`` -> ``a-b``,
so a future model that adds e.g. ``car_truck_accident`` or ``truck_person_accident``
is supported automatically without code changes.

The current model (backend/model/best.pt) has the classes
bike_bike / bike_object / bike_person / car_bike / car_car / car_object / car_person _accident.
It has NO truck class, so CAR-TRUCK and TRUCK-PERSON are reported as unsupported.
"""
from typing import Dict, Iterable, List

# Categories required by the SADARAKSHAK specification (shown first in the UI)
REQUIRED_CATEGORIES = ["car-car", "car-truck", "car-person", "truck-person"]

_SYNONYMS = {"pedestrian": "person", "people": "person", "motorbike": "bike", "motorcycle": "bike",
             "bicycle": "bike", "vehicle": "car", "lorry": "truck", "bus": "truck"}


def category_for(class_name: str) -> str:
    """'car_person_accident' -> 'car-person'; anything unparseable -> 'other'."""
    name = (class_name or "").lower()
    if not name.endswith("_accident"):
        return "other"
    parts = [_SYNONYMS.get(p, p) for p in name[: -len("_accident")].split("_") if p]
    return "-".join(parts[:2]) if len(parts) >= 2 else "other"


def category_label(category: str) -> str:
    if category == "other":
        return "OTHER ACCIDENT"
    return "–".join(p.upper() for p in category.split("-")) + " ACCIDENT"


def categories_for_model(class_names: Iterable[str]) -> List[Dict]:
    """Required categories (with support flag) followed by any extra categories the model provides."""
    by_cat: Dict[str, List[str]] = {}
    for n in class_names:
        if n.lower().endswith("_accident"):
            by_cat.setdefault(category_for(n), []).append(n)
    out = [{"id": c, "label": category_label(c), "required": True, "supported": c in by_cat,
            "yoloClasses": by_cat.get(c, [])} for c in REQUIRED_CATEGORIES]
    for c in sorted(by_cat):
        if c not in REQUIRED_CATEGORIES:
            out.append({"id": c, "label": category_label(c), "required": False, "supported": True,
                        "yoloClasses": by_cat[c]})
    return out
