"""Real SDK serialization, mocked HTTP: one tool-selection turn plus structured extraction."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from google import genai
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.invoice_schemas import InvoiceExtraction, invoice_extraction_json_schema
from test_invoice import data_and_text, pdf


def test_invoice_sdk_function_selection_and_structured_extraction(monkeypatch, embedder):
    payloads = []
    extraction, text = data_and_text()
    model_turn = 0

    def provider(request):
        nonlocal model_turn
        payload = json.loads(request.content)
        payloads.append(payload)
        assert "unit-test-key" not in request.content.decode()
        system = payload["systemInstruction"]["parts"][0]["text"]
        assert "ONBETROUWBARE DATA" in system
        if payload.get("generationConfig", {}).get("responseMimeType") == "application/json":
            schema = payload["generationConfig"]["responseJsonSchema"]
            assert schema["properties"]["invoice"]
            assert_wire_schema(schema)
            assert "tools" not in payload
            pages = json.loads(payload["contents"][0]["parts"][0]["text"])["untrusted_pdf_pages"]
            assert pages[0]["page"] == 2
            parts = [{"text": extraction.model_dump_json()}]
        else:
            model_turn += 1
            names = {f["name"] for f in payload["tools"][0]["functionDeclarations"]}
            assert names == {
                "extract_invoice_data",
                "get_purchase_order",
                "validate_invoice_totals",
                "compare_invoice_with_order",
            }
            if model_turn == 1:
                context = json.loads(payload["contents"][0]["parts"][0]["text"])
                parts = [
                    {
                        "functionCall": {
                            "id": "extract-1",
                            "name": "extract_invoice_data",
                            "args": {"document_id": context["document_id"]},
                        },
                        "thoughtSignature": "c2lnbmF0dXJl",
                    }
                ]
            else:
                assert payload["contents"][1]["parts"][0]["thoughtSignature"] == "c2lnbmF0dXJl"
                output = payload["contents"][2]["parts"][0]["functionResponse"]
                assert output["id"] == "extract-1"
                assert (
                    output["response"]["untrusted_tool_result"]["data"]["invoice_data"][
                        "total_amount"
                    ]
                    == "399.30"
                )
                parts = [
                    {
                        "text": '{"summary":"Het factuurnummer is INV-DEMO-2026-001; rekencontroles zijn niet uitgevoerd."}'
                    }
                ]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}
                ]
            },
        )

    original = genai.Client

    def sdk_client(**options):
        assert options["http_options"].retry_options.attempts == 1
        options["http_options"].httpx_client = httpx.Client(transport=httpx.MockTransport(provider))
        return original(**options)

    monkeypatch.setattr("app.gemini.genai.Client", sdk_client)
    with TestClient(
        create_app(Settings(_env_file=None, gemini_api_key="unit-test-key"), embedder=embedder)
    ) as client:
        doc_id = client.post(
            "/api/documents", files={"file": ("test.pdf", pdf(text), "application/pdf")}
        ).json()["document_id"]
        assert payloads == []
        result = client.post(
            "/api/invoices/analyze",
            json={"document_id": doc_id, "instruction": "Wat is het factuurnummer?"},
        ).json()
    assert result["review_status"] == "insufficient_data", result
    assert result["invoice_data"]["invoice_number"] == "INV-DEMO-2026-001"
    assert len(payloads) == 3
    assert len(result["tool_calls"]) == 1


def assert_wire_schema(schema):
    if isinstance(schema, list):
        for item in schema:
            assert_wire_schema(item)
    elif isinstance(schema, dict):
        assert not {
            "decimal_places",
            "max_digits",
            "default",
            "$ref",
            "$defs",
            "anyOf",
            "format",
            "maxLength",
            "minLength",
            "maxItems",
        }.intersection(schema)
        for item in schema.values():
            assert_wire_schema(item)


def test_invoice_provider_schema_uses_only_decimal_strings_and_keeps_local_validation():
    schema = invoice_extraction_json_schema()
    assert_wire_schema(schema)
    assert "$defs" not in schema
    invoice = schema["properties"]["invoice"]
    line = invoice["properties"]["line_items"]["items"]
    for model, names in [
        (line, ["quantity", "unit_price", "line_total"]),
        (invoice, ["subtotal", "tax_rate", "tax_amount", "total_amount"]),
    ]:
        for name in names:
            assert set(model["properties"][name]["type"]) == {"string", "null"}
    assert set(invoice["required"]) == set(invoice["properties"])
    # Building the provider schema must not alter the canonical model/schema.
    original = InvoiceExtraction.model_json_schema()
    assert "decimal_places" in str(original)


@pytest.mark.parametrize("amount", [1.25, "0.00001", "123456789012345"])
def test_compact_provider_schema_does_not_weaken_decimal_validation(amount):
    extraction, _ = data_and_text()
    data = extraction.model_dump(mode="json")
    data["invoice"]["total_amount"] = amount
    invoice_extraction_json_schema()
    with pytest.raises(ValidationError):
        InvoiceExtraction.model_validate_json(json.dumps(data))
