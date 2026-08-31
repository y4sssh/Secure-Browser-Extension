from datetime import date, datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DatabaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    id: str | None = Field(default=None, alias="_id")


class TimestampedClientDocument(DatabaseDocument):
    client_id: str = Field(default="anonymous", min_length=1, max_length=128)
    timestamp: datetime = Field(default_factory=utc_now)


class PageAnalysisDocument(TimestampedClientDocument):
    hostname: str = Field(default="", max_length=253)
    url_hash: str = Field(default="", max_length=128)
    signals: dict[str, Any] = Field(default_factory=dict)
    scores: dict[str, Any] = Field(default_factory=dict)
    verdict: str = Field(default="unknown", max_length=32)
    reasons: list[str] = Field(default_factory=list)
    model_versions: dict[str, str] = Field(default_factory=dict)


class AlertDocument(TimestampedClientDocument):
    alert_type: str = Field(default="page_analysis", max_length=64)
    severity: str = Field(default="info", max_length=32)
    hostname: str = Field(default="", max_length=253)
    title: str = Field(default="Security alert", max_length=160)
    reasons: list[str] = Field(default_factory=list)
    resolved: bool = False


class DownloadDocument(TimestampedClientDocument):
    filename_hash: str = Field(default="", max_length=128)
    source_hostname: str = Field(default="", max_length=253)
    danger_state: str = Field(default="unknown", max_length=64)
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    user_consented_external_scan: bool = False


class ExtensionFindingDocument(TimestampedClientDocument):
    extension_id_hash: str = Field(default="", max_length=128)
    name: str = Field(default="", max_length=160)
    permissions: list[str] = Field(default_factory=list)
    host_permissions: list[str] = Field(default_factory=list)
    install_type: str = Field(default="unknown", max_length=64)
    enabled: bool = True
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


class WeeklyReportDocument(DatabaseDocument):
    client_id: str = Field(default="anonymous", min_length=1, max_length=128)
    week_start: date
    week_end: date
    summary: str = Field(default="", max_length=1000)
    top_risks: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


PHASE_15_COLLECTIONS: dict[str, list[str]] = {
    "page_analyses": [
        "_id",
        "client_id",
        "timestamp",
        "hostname",
        "url_hash",
        "signals",
        "scores",
        "verdict",
        "reasons",
        "model_versions",
    ],
    "alerts": [
        "_id",
        "client_id",
        "timestamp",
        "alert_type",
        "severity",
        "hostname",
        "title",
        "reasons",
        "resolved",
    ],
    "downloads": [
        "_id",
        "client_id",
        "timestamp",
        "filename_hash",
        "source_hostname",
        "danger_state",
        "risk_score",
        "user_consented_external_scan",
    ],
    "extension_findings": [
        "_id",
        "client_id",
        "timestamp",
        "extension_id_hash",
        "name",
        "permissions",
        "host_permissions",
        "install_type",
        "enabled",
        "risk_score",
        "reasons",
    ],
    "weekly_reports": [
        "_id",
        "client_id",
        "week_start",
        "week_end",
        "summary",
        "top_risks",
        "recommendations",
    ],
}
