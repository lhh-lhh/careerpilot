import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from test_deepseek import settings
from test_schemas import FIXTURES
from test_security import HEADERS

def pair(client,app):
    value=client.post("/api/pair",headers=HEADERS,json={"code":app.state.security.pair_code}).json()
    return {**HEADERS,"Authorization":"Bearer "+value["token"]}

def test_paid_test_and_structured_routes_are_real_guarded_live_and_deduplicate(tmp_path):
    calls=[]
    def upstream(request):
        calls.append(request)
        body=json.loads(request.content)
        content="OK" if body["max_tokens"]==32 else json.dumps(FIXTURES[0]["payload"],ensure_ascii=False)
        return httpx.Response(200,json={"choices":[{"message":{"content":content},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":8}})
    app=create_app(settings(tmp_path),httpx.MockTransport(upstream))
    with TestClient(app) as client:
        auth=pair(client,app)
        assert client.post("/api/ai/test",headers=auth,json={"confirmPaidCall":False}).status_code==400
        assert calls==[]
        assert client.post("/api/ai/test",headers=auth,json={"confirmPaidCall":True}).json()["status"]=="passed"
        result=client.post("/api/ai/structured",headers=auth,json=FIXTURES[0]["wire"])
        assert result.status_code==200
        assert result.json()["effectiveMode"]=="LIVE" and result.json()["origin"]=="MODEL"
        assert result.json()["traceId"]==FIXTURES[0]["wire"]["traceId"]
        assert result.json()["guard"]=={"passed":True,"masked":True,"flags":[]}
        assert client.post("/api/ai/structured",headers=auth,json=FIXTURES[0]["wire"]).json()["error"]["code"]=="INPUT_BLOCKED"
        assert len(calls)==2 and app.state.limits.attempts==2

def test_chat_emits_sequential_final_only_after_guard_and_safe_error(tmp_path):
    fixture=FIXTURES[3]
    def upstream(request):
        text=json.dumps(fixture["payload"],ensure_ascii=False)
        event={"choices":[{"delta":{"content":text},"finish_reason":"stop"}]}
        return httpx.Response(200,content="data: "+json.dumps(event)+"\n\ndata: [DONE]\n\n",headers={"content-type":"text/event-stream"})
    app=create_app(settings(tmp_path),httpx.MockTransport(upstream))
    with TestClient(app) as client:
        auth=pair(client,app)
        result=client.post("/api/ai/chat",headers=auth,json=fixture["wire"])
        assert result.status_code==200 and result.headers["content-type"].startswith("text/event-stream")
        events=result.text.strip().split("\n\n")
        assert len(events)==2 and events[0].startswith("id: 1\nevent: text_delta")
        assert events[1].startswith("id: 2\nevent: final")
        final=json.loads(events[1].split("data: ",1)[1]);assert final["data"]==fixture["payload"]

def test_invalid_guard_never_final_and_upstream_message_not_disclosed(tmp_path):
    app=create_app(settings(tmp_path),httpx.MockTransport(lambda _:httpx.Response(429,json={"secret":"private-provider-detail"})))
    with TestClient(app) as client:
        auth=pair(client,app)
        response=client.post("/api/ai/chat",headers=auth,json=FIXTURES[0]["wire"])
        assert response.status_code==429 and response.json()["error"]["code"]=="RATE_LIMITED"
        assert "event: final" not in response.text and "private" not in response.text
