MODEL_REGISTRY = {
    "url": {
        "version": "url-rules-v1",
        "status": "production",
        "description": "Initial URL heuristic risk model",
    },
    "text": {
        "version": "text-rules-v1-distilbert-ready",
        "status": "production",
        "description": "Text risk scoring + cloud-ready feature model",
    },
    "threat_intel": {
        "version": "threat-intel-v1",
        "status": "production",
        "description": "Rule-based threat intelligence feed for suspicious phishing domains",
    },
    "hybrid": {
        "version": "secure-browser-hybrid-v1",
        "status": "beta",
        "description": "Combined heuristic + visual + policy risk fusion",
    },
}


def get_model_version(name: str) -> str:
    info = MODEL_REGISTRY.get(name, {})
    return str(info.get("version") or "unknown")
