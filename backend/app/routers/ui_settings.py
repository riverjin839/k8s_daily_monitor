from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.app_setting import AppSetting
from app.schemas.ui_settings import (
    UiSettingsResponse,
    UiSettingsUpdate,
    ClusterLinksResponse,
    ClusterLinksUpdate,
    ClusterLinksPayload,
)

router = APIRouter(prefix="/ui-settings", tags=["ui-settings"])

UI_SETTINGS_KEY = "ui_settings"
CLUSTER_LINKS_KEY = "cluster_links"
ASSIGNEES_KEY = "assignees"
DEFAULT_ASSIGNEES = []


DEFAULT_UI_SETTINGS = {
    "app_title": "K8s Daily Monitor",
    "nav_labels": {},
}

DEFAULT_CLUSTER_LINKS = {
    "common_links": [],
    "cluster_groups": [],
}


def _get_or_create(db: Session, key: str, default_value: dict):
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if setting:
        return setting

    setting = AppSetting(key=key, value=default_value)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


@router.get("", response_model=UiSettingsResponse)
def get_ui_settings(db: Session = Depends(get_db)):
    setting = _get_or_create(db, UI_SETTINGS_KEY, DEFAULT_UI_SETTINGS)
    value = setting.value or {}
    return UiSettingsResponse(
        app_title=value.get("app_title", DEFAULT_UI_SETTINGS["app_title"]),
        nav_labels=value.get("nav_labels", {}),
    )


@router.put("", response_model=UiSettingsResponse)
def update_ui_settings(payload: UiSettingsUpdate, db: Session = Depends(get_db)):
    setting = _get_or_create(db, UI_SETTINGS_KEY, DEFAULT_UI_SETTINGS)
    current = setting.value or DEFAULT_UI_SETTINGS.copy()

    next_value = {
        "app_title": payload.app_title if payload.app_title is not None else current.get("app_title", DEFAULT_UI_SETTINGS["app_title"]),
        "nav_labels": payload.nav_labels if payload.nav_labels is not None else current.get("nav_labels", {}),
    }

    setting.value = next_value
    db.commit()
    db.refresh(setting)

    return UiSettingsResponse(**next_value)


@router.get("/cluster-links", response_model=ClusterLinksResponse)
def get_cluster_links(db: Session = Depends(get_db)):
    setting = _get_or_create(db, CLUSTER_LINKS_KEY, DEFAULT_CLUSTER_LINKS)
    value = setting.value or DEFAULT_CLUSTER_LINKS
    payload = ClusterLinksPayload(
        common_links=value.get("common_links", []),
        cluster_groups=value.get("cluster_groups", []),
    )
    return ClusterLinksResponse(data=payload)


@router.put("/cluster-links", response_model=ClusterLinksResponse)
def update_cluster_links(payload: ClusterLinksUpdate, db: Session = Depends(get_db)):
    setting = _get_or_create(db, CLUSTER_LINKS_KEY, DEFAULT_CLUSTER_LINKS)
    next_value = {
        "common_links": [item.model_dump() for item in payload.common_links],
        "cluster_groups": [group.model_dump() for group in payload.cluster_groups],
    }
    setting.value = next_value
    db.commit()
    db.refresh(setting)

    return ClusterLinksResponse(data=ClusterLinksPayload(**next_value))


def _normalize_assignee(a) -> dict | None:
    """Normalize an assignee entry: accepts both plain string (legacy) and object."""
    if isinstance(a, str):
        name = a.strip()
        return {"name": name} if name else None
    if isinstance(a, dict):
        name = str(a.get("name", "")).strip()
        return {
            "name": name,
            "employeeId": a.get("employeeId") or a.get("employee_id"),
            "email": a.get("email"),
            "ip": a.get("ip"),
            "primaryRole": a.get("primaryRole") or a.get("primary_role"),
            "secondaryRole": a.get("secondaryRole") or a.get("secondary_role"),
        } if name else None
    return None


@router.get("/assignees")
def get_assignees(db: Session = Depends(get_db)):
    setting = _get_or_create(db, ASSIGNEES_KEY, DEFAULT_ASSIGNEES)
    value = setting.value
    if isinstance(value, list):
        # Normalize legacy plain strings to Assignee objects
        normalized = [n for a in value if (n := _normalize_assignee(a)) is not None]
        return {"data": normalized}
    return {"data": []}


@router.put("/assignees")
def update_assignees(payload: dict, db: Session = Depends(get_db)):
    assignees = payload.get("assignees", [])
    if not isinstance(assignees, list):
        assignees = []
    # Normalize and deduplicate by name
    seen: set[str] = set()
    cleaned = []
    for raw in assignees:
        entry = _normalize_assignee(raw)
        if entry and entry["name"] not in seen:
            seen.add(entry["name"])
            cleaned.append(entry)
    setting = _get_or_create(db, ASSIGNEES_KEY, DEFAULT_ASSIGNEES)
    setting.value = cleaned
    db.commit()
    db.refresh(setting)
    return {"data": cleaned}
