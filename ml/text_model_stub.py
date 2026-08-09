import re
from urllib.parse import urlparse


BRAND_DOMAINS = {
    "Amazon": ("amazon.com", "amazon.in", "amazon.co.uk", "aws.amazon.com"),
    "Apple": ("apple.com", "icloud.com"),
    "Facebook": ("facebook.com", "fb.com", "meta.com"),
    "Google": ("google.com", "gmail.com", "google.co.in", "accounts.google.com"),
    "HDFC": ("hdfcbank.com",),
    "ICICI": ("icicibank.com",),
    "Instagram": ("instagram.com",),
    "Microsoft": ("microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com"),
    "Netflix": ("netflix.com",),
    "PayPal": ("paypal.com",),
    "SBI": ("onlinesbi.sbi", "sbi.co.in"),
    "WhatsApp": ("whatsapp.com",),
}

LOGIN_PATTERN = re.compile(
    r"\b(log\s*in|sign\s*in|signin|password|passcode|otp|verify|account|username|email|credential|authenticate)\b",
    re.I,
)
URGENCY_PATTERN = re.compile(
    r"\b(urgent|immediate|suspended|locked|disabled|unusual activity|security alert|restore|limited access)\b",
    re.I,
)
ACTION_PATTERN = re.compile(r"\b(confirm|update|recover|unlock|validate|review|secure|continue|reauthenticate)\b", re.I)


def predict_text_risk(snippets: list, claimed_brands: list = None, page_url: str = "") -> dict:
    """Return a lightweight text-risk score for sanitized snippets.

    This is the Phase 6 backend contract and a deterministic fallback for a
    future DistilBERT/BERT classifier. It accepts short redacted snippets only,
    never full page body text.
    """
    claimed_brands = claimed_brands or []
    texts = [str(item.get("text", item))[:160] for item in snippets[:16]]
    haystack = " ".join(texts)
    score = 0.03 if texts else 0.0
    features = {
        "snippetCount": len(texts),
        "hasLoginCue": bool(LOGIN_PATTERN.search(haystack)),
        "hasUrgencyCue": bool(URGENCY_PATTERN.search(haystack)),
        "hasActionCue": bool(ACTION_PATTERN.search(haystack)),
        "brandDomainMismatch": False,
    }
    reasons = []

    if features["hasLoginCue"]:
        score += 0.16
        reasons.append("Sanitized snippets contain login or credential language")

    if features["hasUrgencyCue"]:
        score += 0.16
        reasons.append("Sanitized snippets contain urgency or account-lockout language")

    if features["hasActionCue"] and features["hasLoginCue"]:
        score += 0.12
        reasons.append("Sanitized snippets ask for account verification or recovery")

    mismatched_brand = _first_mismatched_brand(claimed_brands, page_url)
    if mismatched_brand and features["hasLoginCue"]:
        score = max(score, 0.86)
        features["brandDomainMismatch"] = True
        reasons.append(f"Page text claims {mismatched_brand} from outside expected brand domains")

    return {
        "textRisk": round(min(1.0, score), 3),
        "features": features,
        "reasons": reasons[:6],
        "modelVersion": "text-rules-v1-distilbert-ready",
    }


def _first_mismatched_brand(claimed_brands: list, page_url: str) -> str:
    parsed = urlparse(page_url or "")
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname:
        return ""

    for brand in claimed_brands[:4]:
        expected_domains = BRAND_DOMAINS.get(str(brand).strip(), ())
        if expected_domains and not any(hostname == domain or hostname.endswith(f".{domain}") for domain in expected_domains):
            return str(brand).strip()

    return ""
