This folder holds dataset snapshots and prepared feeds used for model training.

Files created by the project tooling:

- `sample_urls.csv` — small example dataset created when feeds are unavailable.
- `openphish.txt` — optional OpenPhish feed (plaintext list of URLs).
- `urlhaus.csv` — optional URLhaus CSV export.
- `merged_urls.csv` — normalized CSV produced by `ml.prepare_datasets`.

Usage:

    python -m ml.prepare_datasets --all

Notes:

- Respect each feed's terms of use. Do not redistribute protected datasets.
- For reproducible experiments, archive snapshots rather than re-downloading.
