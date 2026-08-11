# Evaluation Plan

## Goals

- Measure phishing detection quality with precision, recall, and F1.
- Validate risk scoring across benign and suspicious pages.
- Track false positive rates for normal login pages.
- Measure latency for local page scanning and backend inference.

## Metrics

- Precision: true positives / predicted positives
- Recall: true positives / actual positives
- F1 score: harmonic mean of precision and recall
- PR-AUC: area under the precision-recall curve
- False positive rate: benign pages flagged as risky
- Calibration: whether risk scores align with observed outcomes
- p95 latency: scan and API response times

## Dataset Sources

- Test pages in `test-sites/` for local evaluation.
- Benign login pages and normal sites.
- Fake brand impersonation pages.
- Dynamic phishing pages with injected login forms.
- Download samples for future download scanner evaluation.

## Evaluation Scenarios

- `benign-login`: expected low risk.
- `phishing-cross-domain`: expected high risk due to cross-domain form submission.
- `injected-form`: expected high risk after dynamic DOM injection.
- `iframe-login`: expected high risk when login appears inside an iframe.
- `http-password`: expected high risk for insecure password submission.
- `brandguard-google` / `brandguard-paypal`: expected medium to high risk for brand mismatch.

## Methodology

1. Scan each test page with the extension and record the final trust score, verdict, and reasons.
2. Compare actual expected risk to the verdict labels.
3. Compute metrics for the URL, form, and brand signal subsystems.
4. Document false positives and missed detections.
5. Repeat after changes to scoring or backend analysis.

## Reproducibility

- Use the local `extension` build and the `backend` FastAPI server for consistent results.
- Store sample evidence outputs and test metadata in the repo.
- Keep the evaluation plan updated with any new dataset or scoring changes.
