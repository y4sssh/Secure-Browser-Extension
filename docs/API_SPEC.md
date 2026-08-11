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
