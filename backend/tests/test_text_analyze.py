from backend.app.api.analyze import _contains_unsanitized_text
from ml.text_model_stub import predict_text_risk


def test_text_model_flags_brand_domain_mismatch():
    result = predict_text_risk(
        [
            {"source": "title", "text": "Microsoft account"},
            {"source": "heading", "text": "Security alert verify your password"},
        ],
        ["Microsoft"],
        "https://login-example.test/account",
    )

    assert result["textRisk"] >= 0.86
    assert result["features"]["brandDomainMismatch"] is True
    assert result["modelVersion"] == "text-rules-v1-distilbert-ready"


def test_text_privacy_rejects_unsanitized_values():
    assert _contains_unsanitized_text([{"text": "contact alice@example.com"}]) is True
    assert _contains_unsanitized_text([{"text": "reset code 123456"}]) is True
    assert _contains_unsanitized_text([{"text": "token abcdefabcdefabcdefabcdefabcdef"}]) is True
    assert _contains_unsanitized_text([{"text": "Microsoft sign in [email] [number] [token]"}]) is False
