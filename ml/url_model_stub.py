import ipaddress
import re
from urllib.parse import urlparse

SUSPICIOUS_TLDS = {
    "zip",
    "review",
    "country",
    "kim",
    "work",
    "gq",
    "cc",
    "tk",
    "ml",
    "top",
}

BRAND_KEYWORDS = [
    "login",
    "secure",
    "account",
    "signin",
    "verify",
    "update",
    "password",
    "bank",
    "confirm",
    "paypal",
    "apple",
    "microsoft",
    "google",
    "amazon",
    "facebook",
]

LOGIN_RISK_PATTERN = re.compile(r"\b(?:login|signin|secure|verify|account|password|confirm|update)\b", re.I)
IP_PATTERN = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")

def _subdomain_count(hostname: str) -> int:
    if not hostname:
        return 0
    return max(0, hostname.count('.') - 1)


def _is_ip_address(hostname: str) -> bool:
    if not hostname:
        return False
    if IP_PATTERN.match(hostname):
        return True
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False


def _has_punycode(hostname: str) -> bool:
    return hostname.lower().startswith("xn--")


def _has_suspicious_tld(hostname: str) -> bool:
    if not hostname or "." not in hostname:
        return False
    tld = hostname.rsplit(".", 1)[-1].lower()
    return tld in SUSPICIOUS_TLDS


def _has_brand_keyword(path: str, query: str) -> bool:
    combined = f"{path} {query}".lower()
    return any(keyword in combined for keyword in BRAND_KEYWORDS)


def _url_risk_features(url: str, redirect_chain: list) -> dict:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().strip()
    path = parsed.path or ""
    query = parsed.query or ""
    uses_https = parsed.scheme == "https"
    length = len(url)
    subdomain_count = _subdomain_count(host)
    redirect_count = len(redirect_chain or [])
    has_ip = _is_ip_address(host)
    has_punycode = _has_punycode(host)
    has_suspicious_tld = _has_suspicious_tld(host)
    has_brand_keyword = _has_brand_keyword(path, query)

    return {
        "urlLength": length,
        "usesHttps": uses_https,
        "subdomainCount": subdomain_count,
        "usesIpAddress": has_ip,
        "usesPunycode": has_punycode,
        "suspiciousTld": has_suspicious_tld,
        "brandKeywordInPath": has_brand_keyword,
        "pathLength": len(path),
        "queryLength": len(query),
        "redirectCount": redirect_count,
    }


def predict_url_risk(url: str, redirect_chain: list = None) -> float:
    """Return a simple 0..1 risk score for a URL using lightweight heuristics.

    This rule-based fallback is used for Phase 5 when a trained model is not available.
    """
    redirect_chain = redirect_chain or []
    features = _url_risk_features(url, redirect_chain)

    score = 0.0
    if not features["usesHttps"]:
        score += 0.35
    if features["usesIpAddress"]:
        score += 0.22
    if features["usesPunycode"]:
        score += 0.18
    if features["subdomainCount"] >= 3:
        score += 0.18
    elif features["subdomainCount"] == 2:
        score += 0.08
    if features["suspiciousTld"]:
        score += 0.12
    if features["brandKeywordInPath"]:
        score += 0.1
    if features["pathLength"] > 60:
        score += 0.08
    if features["queryLength"] > 30:
        score += 0.06
    if features["redirectCount"] >= 3:
        score += 0.14
    elif features["redirectCount"] >= 1:
        score += 0.05

    return min(1.0, round(score, 3))


def predict_url_risk_with_features(url: str, redirect_chain: list = None) -> dict:
    redirect_chain = redirect_chain or []
    return {
        "urlRisk": predict_url_risk(url, redirect_chain),
        "features": _url_risk_features(url, redirect_chain),
        "modelVersion": "url-rules-v1",
    }


if __name__ == "__main__":
    examples = [
        "https://example.com/login",
        "http://phishy.bad.example.com/login/very/long/path?x=1",
        "https://a.b.c.d.example.co.uk/login",
        "http://192.168.0.1/secure-login",
    ]
    for u in examples:
        print(u, predict_url_risk_with_features(u, []))
