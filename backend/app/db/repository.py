from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel

from ..models.database import (
    AlertDocument,
    DownloadDocument,
    ExtensionFindingDocument,
    PageAnalysisDocument,
    WeeklyReportDocument,
    utc_now,
)
from .client import PyMongoError, ensure_indexes, get_mongo_database


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"

COLLECTION_FILES = {
    "page_analyses": "page_analyses.jsonl",
    "alerts": "alerts.jsonl",
    "downloads": "downloads.jsonl",
    "extension_findings": "extension_findings.jsonl",
    "weekly_reports": "weekly_reports.jsonl",
}

DOCUMENT_MODELS = {
    "page_analyses": PageAnalysisDocument,
    "alerts": AlertDocument,
    "downloads": DownloadDocument,
    "extension_findings": ExtensionFindingDocument,
    "weekly_reports": WeeklyReportDocument,
}


def hash_sensitive_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_reasons(reasons: Any) -> list[str]:
    if not isinstance(reasons, list):
        return []

    normalized: list[str] = []
    for reason in reasons:
        if isinstance(reason, str):
            normalized.append(reason)
        elif isinstance(reason, dict):
            message = reason.get("message") or reason.get("reason") or reason.get("title")
            if isinstance(message, str):
                normalized.append(message)
    return normalized[:12]


def _snake_value(payload: dict[str, Any], snake_key: str, camel_key: str | None = None, default: Any = None) -> Any:
    if snake_key in payload:
        return payload.get(snake_key)
    if camel_key and camel_key in payload:
        return payload.get(camel_key)
    return default


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return utc_now()
    return utc_now()


def _extract_hostname(url: str) -> str:
    try:
        return urlparse(url).hostname or ""
    except ValueError:
        return ""


def _verdict_from_score(scores: dict[str, Any]) -> str:
    score = scores.get("finalTrustScore")
    if not isinstance(score, (int, float)):
        return "unknown"
    if score < 20:
        return "high_risk"
    if score < 50:
        return "risky"
    if score < 80:
        return "caution"
    return "trusted"


def normalize_page_analysis_payload(payload: dict[str, Any]) -> PageAnalysisDocument:
    evidence = payload.get("pageEvidence") if isinstance(payload.get("pageEvidence"), dict) else payload
    client_id = (
        payload.get("client_id")
        or payload.get("clientId")
        or evidence.get("client_id")
        or evidence.get("clientId")
        or "anonymous"
    )
    raw_url = evidence.get("url") or evidence.get("origin") or ""
    hostname = evidence.get("hostname") or _extract_hostname(raw_url)
    scores = evidence.get("scores") if isinstance(evidence.get("scores"), dict) else {}
    url_hash = _snake_value(evidence, "url_hash", "urlHash") or (hash_sensitive_value(raw_url) if raw_url else "")
    model_versions = _snake_value(evidence, "model_versions", "modelVersions", {})
    if not isinstance(model_versions, dict):
        model_versions = {}

    return PageAnalysisDocument(
        id=payload.get("_id") or payload.get("id") or evidence.get("_id") or evidence.get("id"),
        client_id=str(client_id),
        timestamp=_parse_timestamp(evidence.get("timestamp") or payload.get("timestamp")),
        hostname=str(hostname or ""),
        url_hash=str(url_hash or ""),
        signals=evidence.get("signals") if isinstance(evidence.get("signals"), dict) else {},
        scores=scores,
        verdict=str(evidence.get("verdict") or _verdict_from_score(scores)),
        reasons=normalize_reasons(evidence.get("reasons")),
        model_versions={str(key): str(value) for key, value in model_versions.items()},
    )


def derive_page_alert(document: PageAnalysisDocument) -> AlertDocument | None:
    trust_score = document.scores.get("finalTrustScore")
    verdict = document.verdict.lower()
    if isinstance(trust_score, (int, float)) and trust_score < 20:
        severity = "critical"
    elif verdict == "high_risk":
        severity = "critical"
    elif isinstance(trust_score, (int, float)) and trust_score < 50:
        severity = "warning"
    elif verdict == "risky":
        severity = "warning"
    else:
        return None

    title = "High-risk page detected" if severity == "critical" else "Risky page detected"
    return AlertDocument(
        client_id=document.client_id,
        timestamp=document.timestamp,
        alert_type="page_analysis",
        severity=severity,
        hostname=document.hostname,
        title=title,
        reasons=document.reasons[:5],
        resolved=False,
    )


class DatabaseRepository:
    def __init__(
        self,
        data_dir: str | os.PathLike[str] = DEFAULT_DATA_DIR,
        page_analyses_file: str | os.PathLike[str] | None = None,
        use_mongo: bool = True,
    ):
        self.data_dir = Path(data_dir)
        self.page_analyses_file = Path(page_analyses_file) if page_analyses_file else None
        self.database = get_mongo_database() if use_mongo else None
        if self.database is not None:
            ensure_indexes(self.database)

    @property
    def using_mongo(self) -> bool:
        return self.database is not None

    def insert_page_analysis(self, document: PageAnalysisDocument) -> str:
        return self._insert_document("page_analyses", document)

    def insert_alert(self, document: AlertDocument) -> str:
        return self._insert_document("alerts", document)

    def insert_download(self, document: DownloadDocument) -> str:
        return self._insert_document("downloads", document)

    def insert_extension_finding(self, document: ExtensionFindingDocument) -> str:
        return self._insert_document("extension_findings", document)

    def upsert_weekly_report(self, document: WeeklyReportDocument) -> str:
        if self.database is not None:
            payload = _model_to_db_payload(document)
            payload.pop("_id", None)
            result = self.database["weekly_reports"].update_one(
                {
                    "client_id": document.client_id,
                    "week_start": document.week_start,
                    "week_end": document.week_end,
                },
                {"$set": payload},
                upsert=True,
            )
            inserted_id = result.upserted_id
            if inserted_id is not None:
                return str(inserted_id)
            existing = self.database["weekly_reports"].find_one(
                {
                    "client_id": document.client_id,
                    "week_start": document.week_start,
                    "week_end": document.week_end,
                },
                {"_id": 1},
            )
            return str(existing.get("_id")) if existing else ""

        return self._upsert_jsonl_document(
            "weekly_reports",
            document,
            lambda item: (
                item.get("client_id") == document.client_id
                and item.get("week_start") == document.week_start.isoformat()
                and item.get("week_end") == document.week_end.isoformat()
            ),
        )

    def list_page_analyses(
        self,
        week_start: date,
        week_end: date,
        client_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if self.database is not None:
            start_at = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
            end_at = datetime.combine(week_end, time.max, tzinfo=timezone.utc)
            query: dict[str, Any] = {"timestamp": {"$gte": start_at, "$lte": end_at}}
            if client_id:
                query["client_id"] = client_id
            docs = self.database["page_analyses"].find(query).sort("timestamp", 1)
            return [_document_to_public_dict(doc) for doc in docs]

        analyses = []
        for item in self._read_jsonl_collection("page_analyses"):
            try:
                document = normalize_page_analysis_payload(item)
            except ValueError:
                continue
            if client_id and document.client_id != client_id:
                continue
            if week_start <= document.timestamp.date() <= week_end:
                analyses.append(_document_to_public_dict(_model_to_json_payload(document)))
        return analyses

    def list_alerts(
        self,
        week_start: date,
        week_end: date,
        client_id: str | None = None,
        unresolved_only: bool = False,
    ) -> list[dict[str, Any]]:
        if self.database is not None:
            start_at = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
            end_at = datetime.combine(week_end, time.max, tzinfo=timezone.utc)
            query: dict[str, Any] = {"timestamp": {"$gte": start_at, "$lte": end_at}}
            if client_id:
                query["client_id"] = client_id
            if unresolved_only:
                query["resolved"] = False
            docs = self.database["alerts"].find(query).sort("timestamp", -1)
            return [_document_to_public_dict(doc) for doc in docs]

        alerts = []
        for item in self._read_jsonl_collection("alerts"):
            timestamp = _parse_timestamp(item.get("timestamp"))
            if client_id and item.get("client_id") != client_id:
                continue
            if unresolved_only and item.get("resolved") is True:
                continue
            if week_start <= timestamp.date() <= week_end:
                alerts.append(_document_to_public_dict(item))
        return sorted(alerts, key=lambda item: item.get("timestamp", ""), reverse=True)

    def _insert_document(self, collection_name: str, document: BaseModel) -> str:
        if self.database is not None:
            payload = _model_to_db_payload(document)
            payload.pop("_id", None)
            try:
                result = self.database[collection_name].insert_one(payload)
                return str(result.inserted_id)
            except PyMongoError:
                raise

        payload = _model_to_json_payload(document)
        payload["_id"] = payload.get("_id") or uuid4().hex
        self._append_jsonl(collection_name, payload)
        return str(payload["_id"])

    def _collection_file(self, collection_name: str) -> Path:
        if collection_name == "page_analyses" and self.page_analyses_file is not None:
            return self.page_analyses_file
        filename = COLLECTION_FILES[collection_name]
        return self.data_dir / filename

    def _append_jsonl(self, collection_name: str, payload: dict[str, Any]) -> None:
        path = self._collection_file(collection_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")

    def _read_jsonl_collection(self, collection_name: str) -> list[dict[str, Any]]:
        path = self._collection_file(collection_name)
        if not path.exists():
            return []

        records: list[dict[str, Any]] = []
        with path.open(encoding="utf-8") as file:
            for line in file:
                try:
                    item = json.loads(line.strip())
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    records.append(item)
        return records

    def _upsert_jsonl_document(
        self,
        collection_name: str,
        document: BaseModel,
        matches: Any,
    ) -> str:
        path = self._collection_file(collection_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        records = self._read_jsonl_collection(collection_name)
        payload = _model_to_json_payload(document)

        record_id = payload.get("_id") or uuid4().hex
        payload["_id"] = record_id
        replaced = False
        next_records = []
        for item in records:
            if matches(item):
                payload["_id"] = item.get("_id") or record_id
                replaced = True
                next_records.append(payload)
            else:
                next_records.append(item)

        if not replaced:
            next_records.append(payload)

        with path.open("w", encoding="utf-8") as file:
            for item in next_records:
                file.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")

        return str(payload["_id"])


def _model_to_db_payload(document: BaseModel) -> dict[str, Any]:
    return document.model_dump(mode="python", by_alias=True, exclude_none=True)


def _model_to_json_payload(document: BaseModel) -> dict[str, Any]:
    return document.model_dump(mode="json", by_alias=True, exclude_none=True)


def _document_to_public_dict(document: dict[str, Any]) -> dict[str, Any]:
    result = dict(document)
    if "_id" in result:
        result["_id"] = str(result["_id"])
    return result
