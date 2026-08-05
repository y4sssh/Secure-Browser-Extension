import re
from urllib.parse import urlparse


def _subdomain_count(hostname: str) -> int:
    if not hostname:
        return 0
    return max(0, hostname.count('.') - 1)


def predict_url_risk(url: str, redirect_chain: list = None) -> float:
    """Return a simple 0..1 risk score for a URL using lightweight heuristics.

    This is a stub for Phase 5. Replace with trained model later.
    """
    if redirect_chain is None:
        redirect_chain = []

    parsed = urlparse(url)
    host = parsed.hostname or ""
    uses_https = parsed.scheme == "https"
    length = len(url)
    dots = _subdomain_count(host)

    score = 0.0
    # longer URLs slightly more risky
    if length > 100:
        score += 0.25
    elif length > 60:
        score += 0.1

    # missing HTTPS increases risk
    if not uses_https:
        score += 0.4

    # many subdomains increases risk
    if dots >= 3:
        score += 0.25
    elif dots == 2:
        score += 0.1

    # redirect chain length
    if len(redirect_chain) >= 3:
        score += 0.2

    return min(1.0, round(score, 3))


if __name__ == "__main__":
    # quick manual test
    examples = [
        "https://example.com/login",
        "http://phishy.bad.example.com/login/very/long/path?x=1",
        "https://a.b.c.d.example.co.uk/login",
    ]
    for u in examples:
        print(u, predict_url_risk(u, []))
