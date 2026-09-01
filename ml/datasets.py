"""Dataset and feed helpers for Phase 17: Datasets and Feeds.

This module provides safe, optional download routines for common phishing
and benign URL feeds and a simple normalizer that writes a merged CSV.

Notes:
- Many feeds require API keys or have usage terms. This code is defensive
  and will create a small sample file when feeds cannot be downloaded.
"""
from pathlib import Path
import csv
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.joinpath("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _safe_get_text(url: str, timeout: int = 10) -> str:
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.debug("Failed to fetch %s: %s", url, e)
        return ""


def download_openphish(dest: Path = None) -> Path:
    """Download OpenPhish feed (simple text feed of URLs).

    Returns path to file (may be empty if download failed).
    """
    dest = Path(dest or DATA_DIR.joinpath("openphish.txt"))
    url = "https://openphish.com/feed.txt"
    text = _safe_get_text(url)
    dest.write_text(text)
    return dest


def download_urlhaus_csv(dest: Path = None) -> Path:
    """Download URLhaus CSV feed.

    Returns path to CSV file (may be empty if download failed).
    """
    dest = Path(dest or DATA_DIR.joinpath("urlhaus.csv"))
    url = "https://urlhaus.abuse.ch/downloads/csv/"
    text = _safe_get_text(url)
    dest.write_text(text)
    return dest


def download_tranco_list(dest: Path = None, top_n: int = 1000) -> Path:
    """Fetch Tranco list via the public download URL for convenience.

    This uses the static list export which may change; for reproducible
    experiments, follow Tranco's recommended API and caching procedures.
    """
    dest = Path(dest or DATA_DIR.joinpath("tranco_top.txt"))
    # Tranco provides exports; here we use the simple top 1k snapshot URL
    url = f"https://tranco-list.eu/top-1m.csv.zip"
    # We won't attempt to unzip in this lightweight helper; leave placeholder
    text = _safe_get_text(url)
    dest.write_text(text)
    return dest


def write_sample_dataset(out_csv: Path = None) -> Path:
    out_csv = Path(out_csv or DATA_DIR.joinpath("sample_urls.csv"))
    rows = [
        {"url": "https://example.com/login", "label": "benign", "source": "sample", "date": datetime.utcnow().isoformat()},
        {"url": "http://phishy.bad.example.com/login/verify", "label": "phish", "source": "sample", "date": datetime.utcnow().isoformat()},
    ]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["url", "label", "source", "date"])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    return out_csv


def normalize_feeds_to_csv(sources: list, out_csv: Path = None) -> Path:
    """Normalize a list of feed files (text or CSV) into a single CSV with
    columns: url,label,source,date.

    The function is permissive: it will skip unreadable files and include
    rows it can parse. If no data is available, it writes a sample dataset.
    """
    out_csv = Path(out_csv or DATA_DIR.joinpath("merged_urls.csv"))
    rows = []
    for src in sources:
        p = Path(src)
        if not p.exists():
            logger.debug("Source file missing: %s", p)
            continue
        try:
            text = p.read_text()
        except Exception:
            logger.debug("Unable to read source: %s", p)
            continue

        if p.suffix.lower() in {".csv"}:
            # Try parse CSV and look for a url-like column
            for line in text.splitlines():
                # naive split: common URL is first or second column
                cols = [c.strip() for c in line.split(",") if c.strip()]
                if not cols:
                    continue
                candidate = cols[0]
                if candidate.startswith("http"):
                    rows.append({"url": candidate, "label": "unknown", "source": p.name, "date": ""})
        else:
            # Treat as plaintext list of URLs
            for line in text.splitlines():
                u = line.strip()
                if not u or not u.startswith("http"):
                    continue
                rows.append({"url": u, "label": "unknown", "source": p.name, "date": ""})

    if not rows:
        out = write_sample_dataset(out_csv)
        logger.info("No feeds found; wrote sample dataset to %s", out)
        return out

    # write merged CSV
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["url", "label", "source", "date"])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    logger.info("Wrote merged dataset with %d rows to %s", len(rows), out_csv)
    return out_csv


if __name__ == "__main__":
    print("Data dir:", DATA_DIR)
    print("Writing sample dataset...")
    print(write_sample_dataset())
