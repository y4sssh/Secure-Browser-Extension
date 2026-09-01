"""CLI helper to fetch and normalize dataset feeds for Phase 17.

Usage:
    python -m ml.prepare_datasets --all
    python -m ml.prepare_datasets --merge ml/data/openphish.txt ml/data/urlhaus.csv

This script is defensive: if downloads fail it will write a small sample
CSV to `ml/data/sample_urls.csv` so downstream code has something to use.
"""
import argparse
from pathlib import Path
from . import datasets
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Prepare URL datasets and feeds")
    parser.add_argument("--all", action="store_true", help="Attempt to download known feeds")
    parser.add_argument("--merge", nargs="*", help="Merge existing feed files into a CSV")
    parser.add_argument("--out", help="Output CSV path", default=str(Path(datasets.DATA_DIR).joinpath("merged_urls.csv")))
    args = parser.parse_args()

    out = Path(args.out)

    if args.all:
        logger.info("Downloading OpenPhish feed...")
        datasets.download_openphish()
        logger.info("Downloading URLhaus CSV...")
        datasets.download_urlhaus_csv()
        logger.info("Attempting Tranco placeholder download (may be large)...")
        datasets.download_tranco_list()

    sources = []
    if args.merge:
        sources = args.merge
    else:
        # default to any files in ml/data
        sources = [str(p) for p in Path(datasets.DATA_DIR).glob("*") if p.is_file()]

    logger.info("Normalizing %d source files into %s", len(sources), out)
    merged = datasets.normalize_feeds_to_csv(sources, out_csv=out)
    logger.info("Done. Merged dataset: %s", merged)


if __name__ == "__main__":
    main()
