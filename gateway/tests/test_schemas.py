import copy
import json
from pathlib import Path
import pytest
from app.schemas import canonical_json, validate_wire, guard_payload
from app.errors import GatewayError

ROOT=Path(__file__).resolve().parents[2]
FIXTURES=json.loads((ROOT/"tests/fixtures/ai-wire.json").read_text(encoding="utf-8"))

@pytest.mark.parametrize("fixture",json.loads((ROOT/"tests/fixtures/ai-golden.json").read_text(encoding="utf-8")),ids=lambda f:f["id"])
def test_jcs_matches_browser_golden(fixture):
    assert canonical_json(fixture["input"])==fixture["canonical"]

@pytest.mark.parametrize("fixture",FIXTURES,ids=lambda f:f["id"])
def test_browser_requests_hash_and_payloads_validate(fixture):
    assert validate_wire(fixture["wire"])==fixture["wire"]
    assert guard_payload(fixture["wire"],fixture["payload"])==fixture["payload"]

@pytest.mark.parametrize("mutation",["hash","extra","contact","operation","prototype"])
def test_bad_input_rejected_before_upstream(mutation):
    wire=copy.deepcopy(FIXTURES[0]["wire"])
    if mutation=="hash": wire["inputHash"]="0"*64
    elif mutation=="extra": wire["apiKey"]="fake-key"
    elif mutation=="contact": wire["variables"]["fields"][0]["text"]="demo@example.invalid"
    elif mutation=="operation": wire["operation"]="query"
    else: wire["variables"]["__proto__"]={}
    with pytest.raises(GatewayError) as caught: validate_wire(wire)
    assert caught.value.code=="INPUT_BLOCKED"

@pytest.mark.parametrize("field,value",[("module",[]),("module",{}),("module",None),("operation",[]),("operation",{})])
def test_unhashable_wire_fields_return_typed_input_error(field,value):
    wire=copy.deepcopy(FIXTURES[0]["wire"]);wire[field]=value
    with pytest.raises(GatewayError) as caught:validate_wire(wire)
    assert caught.value.code=="INPUT_BLOCKED"

def test_payload_forbids_score_stale_quote_and_unregistered_tokens():
    for fixture in [FIXTURES[0],next(f for f in FIXTURES if f["id"]=="a3-high"),FIXTURES[-1]]:
        payload=copy.deepcopy(fixture["payload"]);payload["score"]=100
        with pytest.raises(GatewayError) as caught: guard_payload(fixture["wire"],payload)
        assert caught.value.code=="SCHEMA_INVALID"
    payload=copy.deepcopy(FIXTURES[0]["payload"]);payload["suggestions"][0]["before"]="not current"
    with pytest.raises(GatewayError): guard_payload(FIXTURES[0]["wire"],payload)
    fixture=next(f for f in FIXTURES if f["id"]=="a3-high")
    for text in ["匹配得分99","{{metric:destinationRate}}","<script>run()</script>"]:
        payload={**fixture["payload"],"text":text}
        with pytest.raises(GatewayError) as caught: guard_payload(fixture["wire"],payload)
        assert caught.value.code=="SEMANTIC_INVALID"

def test_unsupported_achievements_quarantined_and_utf16_ranges_checked():
    fixture=FIXTURES[0];payload=copy.deepcopy(fixture["payload"])
    payload["suggestions"][0]["after"]="主导新的项目，实现99%增长"
    result=guard_payload(fixture["wire"],payload)
    assert result["suggestions"][0]["requiresUserInput"] is True
    assert "待核实" in result["suggestions"][0]["after"]
