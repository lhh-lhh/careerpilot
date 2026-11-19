import json
import httpx
import pytest
from app.config import load_settings
from app.deepseek import DeepSeek
from app.errors import GatewayError
from test_schemas import FIXTURES

def settings(tmp_path):
    return load_settings(environ={"AI_API_KEY":"fake-unit-key","AI_LIVE_ENABLED":"true"},env_file=tmp_path/"none")

@pytest.mark.asyncio
async def test_structured_fixed_official_url_payload_and_no_retry(tmp_path):
    fixture=FIXTURES[0];calls=[]
    def upstream(request):
        calls.append(request)
        assert str(request.url)=="https://api.deepseek.com/chat/completions"
        assert request.headers["authorization"]=="Bearer fake-unit-key"
        body=json.loads(request.content)
        assert body["model"]=="deepseek-flash"
        assert body["thinking"]=={"type":"disabled"}
        assert body["response_format"]=={"type":"json_object"}
        assert body["max_tokens"]==1200 and body["stream"] is False
        assert len(body["messages"])==2 and "JSON" in body["messages"][0]["content"]
        assert json.loads(body["messages"][1]["content"])==fixture["wire"]["variables"]
        return httpx.Response(200,json={"model":"provider-reported-model","choices":[{"message":{"content":json.dumps(fixture["payload"],ensure_ascii=False)},"finish_reason":"stop"}],"usage":{"prompt_tokens":23,"completion_tokens":42}})
    adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(upstream))
    result=await adapter.complete(fixture["wire"])
    assert result["data"]==fixture["payload"]
    assert result["usage"]=={"prompt":23,"completion":42}
    assert result["providerModel"]=="provider-reported-model"
    assert len(calls)==1
    await adapter.close()

@pytest.mark.parametrize("status,code",[(400,"PROVIDER_CONFIG_ERROR"),(401,"AUTH_FAILED"),(403,"AUTH_FAILED"),(402,"QUOTA_EXCEEDED"),(404,"PROVIDER_CONFIG_ERROR"),(422,"PROVIDER_CONFIG_ERROR"),(429,"RATE_LIMITED"),(500,"UPSTREAM_ERROR"),(302,"UPSTREAM_ERROR")])
async def test_error_mapping_never_echoes_or_retries(status,code,tmp_path):
    calls=[]
    def upstream(request):
        calls.append(request);return httpx.Response(status,json={"secret":"sensitive-provider-message"})
    adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(upstream))
    with pytest.raises(GatewayError) as caught:await adapter.complete(FIXTURES[0]["wire"])
    assert caught.value.code==code and "sensitive" not in str(caught.value)
    assert len(calls)==1;await adapter.close()

@pytest.mark.parametrize("content,finish",[("", "stop"),("{}","length"),("{}","tool_calls"),("not json","stop"),("{","stop"),("{}","stop")])
async def test_bad_or_truncated_json_rejected(content,finish,tmp_path):
    adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(lambda _:httpx.Response(200,json={"choices":[{"message":{"content":content},"finish_reason":finish}]})))
    with pytest.raises(GatewayError):await adapter.complete(FIXTURES[0]["wire"])
    await adapter.close()

@pytest.mark.parametrize("value",[None,[],{"choices":None},{"choices":{}},{"choices":[None]}, {"choices":[{"finish_reason":"stop","message":None}]}])
async def test_malformed_upstream_envelope_is_typed_not_internal_exception(value,tmp_path):
    adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(lambda _:httpx.Response(200,content=json.dumps(value),headers={"content-type":"application/json"})))
    try:
        with pytest.raises(GatewayError) as caught:await adapter.complete(FIXTURES[0]["wire"])
        assert caught.value.code=="UPSTREAM_ERROR"
    finally:await adapter.close()

class BytesStream(httpx.AsyncByteStream):
    def __init__(self,data):self.data=data;self.closed=False
    async def __aiter__(self):
        for byte in self.data:yield bytes([byte])
    async def aclose(self):self.closed=True

async def test_sse_split_unicode_requires_finish_and_done_and_terminal_usage(tmp_path):
    fixture=FIXTURES[3];text=json.dumps(fixture["payload"],ensure_ascii=False)
    def event(value):return "data: "+json.dumps(value,ensure_ascii=False)+"\r\n\r\n"
    sse=(event({"choices":[{"delta":{"content":text[:15]},"finish_reason":None}]})+
         event({"choices":[{"delta":{"content":text[15:]},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":12}})+"data: [DONE]\r\n\r\n").encode()
    stream=BytesStream(sse);adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(lambda _:httpx.Response(200,stream=stream,headers={"content-type":"text/event-stream"})))
    deltas=[];result=await adapter.stream(fixture["wire"],deltas.append)
    assert result["data"]==fixture["payload"] and "".join(deltas)==text
    assert result["usage"]=={"prompt":8,"completion":12} and stream.closed
    await adapter.close()

@pytest.mark.parametrize("ending",["missing-done","missing-finish","length","extra","invalid-utf8","oversized"])
async def test_sse_invalid_terminal_encoding_and_limit(ending,tmp_path):
    payload=json.dumps(FIXTURES[0]["payload"],ensure_ascii=False)
    finish=None if ending=="missing-finish" else "length" if ending=="length" else "stop"
    sse=("data: "+json.dumps({"choices":[{"delta":{"content":payload},"finish_reason":finish}]})+"\n\n").encode()
    if ending!="missing-done":sse+=b"data: [DONE]\n\n"
    if ending=="extra":sse+=b'data: {"choices":[]}\n\n'
    if ending=="invalid-utf8":sse=b"\xff"+sse
    if ending=="oversized":sse=b" "*(256*1024+1)
    stream=BytesStream(sse);adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(lambda _:httpx.Response(200,stream=stream,headers={"content-type":"text/event-stream"})))
    with pytest.raises(GatewayError):await adapter.stream(FIXTURES[0]["wire"],lambda _:None)
    assert stream.closed;await adapter.close()

async def test_paid_connection_test_fixed_minimal_prompt_and_nonempty_result(tmp_path):
    def upstream(request):
        body=json.loads(request.content)
        assert body["max_tokens"]==32
        assert "variables" not in request.content.decode()
        return httpx.Response(200,json={"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]})
    adapter=DeepSeek(settings(tmp_path),httpx.MockTransport(upstream));result=await adapter.test()
    assert result["usage"] is None
    await adapter.close()
