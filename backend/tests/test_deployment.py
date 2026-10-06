"""Keep test servers, credentials and model binaries outside the function package."""
import json

from backend.tests.test_api import api


def test_prefixed_api_route(api):
    client, _, _, _, _ = api
    assert client.get("/api/v1/model/latest").status_code == 200


def test_function_has_explicit_budget_and_exclusions():
    with open("vercel.json", encoding="utf-8-sig") as source:
        config = json.load(source)
    function = config["functions"]["api/index.py"]
    assert function["maxDuration"] == 60
    assert "backend/tests/**" in function["excludeFiles"]
    assert "*.onnx" in function["excludeFiles"]
    assert config["rewrites"][0]["source"] == "/api/(.*)"
