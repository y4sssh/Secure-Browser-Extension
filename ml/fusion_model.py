from .url_model_stub import predict_url_risk_with_features
from .text_model_stub import predict_text_risk
from .visual_model_stub import predict_visual_brand_risk


def fuse_signals(url: str = "", redirect_chain: list = None, snippets: list = None, claimed_brands: list = None, formRisk: float = 0.0, reputationRisk: float = 0.0, visual_image: bytes = None) -> dict:
    """Fuse multiple signals into a finalRisk and trustScore.

    Implements the simple fusion heuristic from the implementation plan:

    finalRisk = max(formRisk, brandRisk * 0.9, urlRisk * 0.75, reputationRisk)
    trustScore = round(100 - finalRisk * 100)

    The function also includes text and visual signals with modest weighting
    so they contribute but do not dominate the verdict.
    """
    redirect_chain = redirect_chain or []
    snippets = snippets or []
    claimed_brands = claimed_brands or []

    url_out = predict_url_risk_with_features(url, redirect_chain)
    urlRisk = float(url_out.get("urlRisk", 0.0))

    text_out = predict_text_risk(snippets, claimed_brands, page_url=url)
    textRisk = float(text_out.get("textRisk", 0.0))

    visual_out = predict_visual_brand_risk(visual_image, claimed_brands)
    visualRisk = float(visual_out.get("visualBrandRisk", 0.0))

    # Brand risk is approximated by textRisk for now (placeholder).
    brandRisk = textRisk

    # Fusion formula per plan; include text/visual with smaller multipliers
    candidates = [
        float(formRisk),
        brandRisk * 0.9,
        urlRisk * 0.75,
        float(reputationRisk),
        textRisk * 0.95,
        visualRisk * 0.9,
    ]

    finalRisk = max(candidates)
    finalRisk = min(1.0, round(finalRisk, 3))
    trustScore = int(round(100 - finalRisk * 100))

    # Build a short explanation with top contributors
    components = {
        "urlRisk": urlRisk,
        "textRisk": textRisk,
        "visualRisk": visualRisk,
        "formRisk": float(formRisk),
        "reputationRisk": float(reputationRisk),
        "brandRisk": brandRisk,
    }

    # Determine top reasons (simple heuristic)
    reasons = []
    if components["formRisk"] >= 0.7:
        reasons.append("Form submission looks risky")
    if components["brandRisk"] >= 0.6:
        reasons.append("Brand mismatch indicated by text clues")
    if components["urlRisk"] >= 0.6:
        reasons.append("URL exhibits strong phishing-like signals")
    if components["reputationRisk"] >= 0.6:
        reasons.append("Reputation sources indicate high risk")
    if components["visualRisk"] >= 0.6:
        reasons.append("Visual logo similarity indicates risk")
    if components["textRisk"] >= 0.5 and "Brand mismatch" not in " ".join(reasons):
        reasons.append("Suspicious page text detected")

    if not reasons:
        reasons.append("No single dominant risk; aggregated signals considered")

    return {
        "finalRisk": finalRisk,
        "trustScore": trustScore,
        "components": components,
        "reasons": reasons,
        "modelVersion": "fusion-simple-v1",
    }


def demo():
    url = "http://phishy.example.com/login/verify"
    snippets = [
        {"text": "Please sign in to verify your account immediately"},
        {"text": "Click here to update your password"},
    ]
    out = fuse_signals(url=url, snippets=snippets, claimed_brands=["PayPal"], formRisk=0.85, reputationRisk=0.1)
    print(out)


if __name__ == "__main__":
    demo()
