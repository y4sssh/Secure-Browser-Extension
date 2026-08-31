# API Specification

## Base URL

- Local development: `http://127.0.0.1:8000`

## Endpoints

### GET /health

- Description: Backend health check.
- Response:
  - `200 OK`
  - `{ "status": "ok" }`

### POST /api/v1/analyze/url

- Description: Analyze a URL and return a risk score with features.
- Request body:
  ```json
  {
    "url": "https://example.com/login",
    "redirectChain": ["https://redirect.example.com"]
  }
  ```
- Response body:
  ```json
  {
    "urlRisk": 0.63,
    "features": {
      "urlLength": 43,
      "usesHttps": true,
      "subdomainCount": 1,
      "suspiciousTokenCount": 1
    },
    "modelVersion": "url-rule-v1"
  }
  ```

### POST /api/v1/analyze/text

- Description: Analyze sanitized page text snippets when the user has consented to cloud analysis.
- Request body:
  ```json
  {
    "pageUrl": "https://example.com/login",
    "claimedBrands": ["Microsoft"],
    "snippets": [
      { "source": "title", "text": "Sign in to your Microsoft account" }
    ],
    "cloudAiConsent": true
  }
  ```
- Response body:
  ```json
  {
    "textRisk": 0.72,
    "claimedBrand": "Microsoft",
    "reasons": ["Page text resembles a branded login prompt"]
  }
  ```

### POST /api/v1/evidence

- Description: Ingest sanitized page evidence from the extension.
- Persistence: stores a Phase 15 `page_analyses` record with `client_id`, `timestamp`, `hostname`, `url_hash`, `signals`, `scores`, `verdict`, `reasons`, and `model_versions`. If a raw `url` is present for compatibility, the backend hashes it and does not persist the raw URL.
- Request body:
  ```json
  {
    "clientId": "local-anonymous-id",
    "pageEvidence": {
      "url": "https://example.com/login",
      "hostname": "example.com",
      "signals": { "hasPasswordField": true },
      "scores": { "finalTrustScore": 32 },
      "reasons": ["Password form submits to a different domain"]
    }
  }
  ```
- Response body:
  ```json
  {
    "stored": true,
    "analysisId": "generated-record-id",
    "alertId": "generated-alert-id-if-risky",
    "storageBackend": "jsonl",
    "serverRisk": 0.72,
    "recommendations": ["Do not enter credentials on this page."]
  }
  ```

### POST /api/v1/chat/explain

- Description: Explain evidence-based risk signals to the user.
- Request body:
  ```json
  {
    "question": "Why is this risky?",
    "evidence": {
      "verdict": "high_risk",
      "reasons": ["Password form submits to a different domain"]
    }
  }
  ```
- Response body:
  ```json
  {
    "answer": "This page is considered high risk. Password form submits to a different domain."
  }
  ```

## Security Requirements

- Reject any payload containing raw passwords, cookie values, email addresses, phone numbers, or unredacted HTML.
- Require `cloudAiConsent` for text analysis requests.
- Keep reputation API keys and external service credentials only on the backend.

## Database Collections

- `page_analyses`: `_id`, `client_id`, `timestamp`, `hostname`, `url_hash`, `signals`, `scores`, `verdict`, `reasons`, `model_versions`.
- `alerts`: `_id`, `client_id`, `timestamp`, `alert_type`, `severity`, `hostname`, `title`, `reasons`, `resolved`.
- `downloads`: `_id`, `client_id`, `timestamp`, `filename_hash`, `source_hostname`, `danger_state`, `risk_score`, `user_consented_external_scan`.
- `extension_findings`: `_id`, `client_id`, `timestamp`, `extension_id_hash`, `name`, `permissions`, `host_permissions`, `install_type`, `enabled`, `risk_score`, `reasons`.
- `weekly_reports`: `_id`, `client_id`, `week_start`, `week_end`, `summary`, `top_risks`, `recommendations`.
