from __future__ import annotations

from functools import lru_cache
from typing import Any

from ..config import settings

try:
    from pymongo import ASCENDING, DESCENDING, MongoClient
    from pymongo.database import Database
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - exercised on installs without pymongo.
    ASCENDING = 1
    DESCENDING = -1
    MongoClient = None
    Database = Any
    PyMongoError = Exception


COLLECTION_INDEXES: dict[str, list[tuple[list[tuple[str, int]], dict[str, Any]]]] = {
    "page_analyses": [
        ([("client_id", ASCENDING), ("timestamp", DESCENDING)], {"name": "client_timestamp"}),
        ([("hostname", ASCENDING), ("timestamp", DESCENDING)], {"name": "hostname_timestamp"}),
        ([("verdict", ASCENDING), ("timestamp", DESCENDING)], {"name": "verdict_timestamp"}),
        ([("url_hash", ASCENDING)], {"name": "url_hash"}),
    ],
    "alerts": [
        ([("client_id", ASCENDING), ("resolved", ASCENDING), ("timestamp", DESCENDING)], {"name": "client_resolved_timestamp"}),
        ([("severity", ASCENDING), ("timestamp", DESCENDING)], {"name": "severity_timestamp"}),
        ([("hostname", ASCENDING)], {"name": "hostname"}),
    ],
    "downloads": [
        ([("client_id", ASCENDING), ("timestamp", DESCENDING)], {"name": "client_timestamp"}),
        ([("filename_hash", ASCENDING)], {"name": "filename_hash"}),
        ([("source_hostname", ASCENDING)], {"name": "source_hostname"}),
    ],
    "extension_findings": [
        ([("client_id", ASCENDING), ("timestamp", DESCENDING)], {"name": "client_timestamp"}),
        ([("client_id", ASCENDING), ("extension_id_hash", ASCENDING)], {"name": "client_extension_hash"}),
    ],
    "weekly_reports": [
        (
            [("client_id", ASCENDING), ("week_start", ASCENDING), ("week_end", ASCENDING)],
            {"name": "client_week", "unique": True},
        ),
    ],
}


@lru_cache(maxsize=1)
def get_mongo_client():
    if MongoClient is None or not settings.mongo_enabled or not settings.mongodb_uri:
        return None
    return MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=settings.mongodb_timeout_ms)


def get_mongo_database() -> Database | None:
    client = get_mongo_client()
    if client is None:
        return None
    try:
        client.admin.command("ping")
    except PyMongoError:
        if settings.storage_backend in {"mongodb", "mongo"}:
            raise
        return None
    return client[settings.db_name]


def ensure_indexes(database: Database | None) -> None:
    if database is None:
        return

    for collection_name, indexes in COLLECTION_INDEXES.items():
        collection = database[collection_name]
        for keys, options in indexes:
            collection.create_index(keys, **options)


client = get_mongo_client()
db = None
