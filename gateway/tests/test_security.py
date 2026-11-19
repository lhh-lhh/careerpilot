import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import load_settings
from app.security import Pairing
from app.errors import GatewayError

HEADERS={"Origin":"http://127.0.0.1:4173","Host":"127.0.0.1:8787"}
def denied(request):
    pytest.fail("an unauthorized or disabled request reached the paid upstream")

def test_disabled_gateway_refuses_paid_test_without_upstream(tmp_path):
    app=create_app(load_settings(environ={},env_file=tmp_path/"none"),transport=httpx.MockTransport(denied))
    with TestClient(app) as client:
        response=client.post("/api/ai/test",headers=HEADERS,json={"confirmPaidCall":True})
        assert response.status_code==401
        assert response.json()["error"]["code"]=="PAIRING_REQUIRED"

def test_origin_host_docs_and_body_boundaries(tmp_path):
    app=create_app(load_settings(environ={},env_file=tmp_path/"none"),transport=httpx.MockTransport(denied))
    with TestClient(app) as client:
        assert client.get("/health",headers={"Host":"127.0.0.1:8787"}).json()=={"status":"ok","gatewayVersion":"1.0"}
        for headers in [{"Host":"evil.invalid","Origin":HEADERS["Origin"]},{"Host":HEADERS["Host"],"Origin":"null"},{"Host":HEADERS["Host"]}]:
            assert client.post("/api/pair",headers=headers,json={"code":"00000000"}).status_code==403
        for route in ["/docs","/redoc","/openapi.json"]:
            assert client.get(route,headers=HEADERS).status_code==404
        assert client.post("/api/pair",headers=HEADERS,content="{}",).status_code==415
        assert client.post("/api/pair",headers=HEADERS,json={"code":"00000000","apiKey":"fake"}).status_code==400
        assert client.post("/api/pair",headers={**HEADERS,"Cookie":"session=fake"},json={"code":"00000000"}).status_code==403
        assert client.post("/api/pair",headers={**HEADERS,"Content-Type":"application/json"},content=b" "*65537).status_code==413
        cors=client.options("/api/pair",headers={**HEADERS,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type,authorization"})
        assert cors.status_code==204
        assert cors.headers["Access-Control-Allow-Origin"]==HEADERS["Origin"]

def test_pair_once_five_failures_expiry_and_memory_token(tmp_path):
    app=create_app(load_settings(environ={},env_file=tmp_path/"none"),transport=httpx.MockTransport(denied))
    with TestClient(app) as client:
        code=app.state.security.pair_code
        assert len(code)==8 and code.isdigit()
        pair=client.post("/api/pair",headers=HEADERS,json={"code":code})
        assert pair.status_code==200
        token=pair.json()["token"]
        assert len(token)>=43
        assert token not in repr(app.state.security)
        assert client.post("/api/pair",headers=HEADERS,json={"code":code}).status_code==401
        auth={**HEADERS,"Authorization":f"Bearer {token}"}
        assert client.get("/api/ai/providers",headers=auth).json()["configured"] is False
        assert client.post("/api/ai/test",headers=auth,json={"confirmPaidCall":True}).json()["error"]["code"]=="PROVIDER_DISABLED"
        assert client.post("/api/unpair",headers=auth,json={}).status_code==204
        assert client.get("/api/ai/providers",headers=auth).status_code==401

def test_pair_code_five_wrong_attempts_and_expiry_cannot_be_reused():
    now=[0.0];security=Pairing("test-instance",lambda:now[0])
    wrong="00000000" if security.pair_code!="00000000" else "11111111"
    for _ in range(5):
        with pytest.raises(GatewayError):security.pair(wrong)
    with pytest.raises(GatewayError):security.pair(security.pair_code)
    security=Pairing("next-instance",lambda:now[0]);now[0]=300
    with pytest.raises(GatewayError):security.pair(security.pair_code)
    security=Pairing("third-instance",lambda:now[0]);token=security.pair(security.pair_code)["token"]
    now[0]+=1800
    with pytest.raises(GatewayError) as caught:security.authenticate("Bearer "+token)
    assert caught.value.code=="PAIRING_REQUIRED"
