import json
import uuid
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from .errors import GatewayError
from .security import Pairing
from .deepseek import DeepSeek
from .limits import Limits
from .schemas import WIRE_FIELDS, validate_wire

ORIGIN = "http://127.0.0.1:4173"
HOST = "127.0.0.1:8787"

def safe_error(error, trace_id=None):
    return JSONResponse({"error":{"code":error.code,"traceId":trace_id or uuid.uuid4().hex,
                                 "retryable":error.code in {"NETWORK_ERROR","UPSTREAM_ERROR","TIMEOUT","RATE_LIMITED","QUEUE_FULL","QUEUE_TIMEOUT"}}},status_code=error.status)

def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result:
            raise GatewayError("INPUT_BLOCKED")
        result[key]=value
    return result

async def strict_body(request, fields):
    try:
        value=json.loads((await request.body()).decode("utf-8"),object_pairs_hook=unique_object,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError,UnicodeError):
        raise GatewayError("INPUT_BLOCKED") from None
    if not isinstance(value,dict) or set(value)!=set(fields):
        raise GatewayError("INPUT_BLOCKED")
    return value

def create_app(settings, transport=None):
    adapter=DeepSeek(settings,transport)
    limits=Limits()
    @asynccontextmanager
    async def lifespan(_app):
        yield
        limits.cancel_all()
        await adapter.close()
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,debug=False,lifespan=lifespan)
    security=Pairing(uuid.uuid4().hex)
    app.state.security=security
    app.state.settings=settings
    app.state.limits=limits
    traces=set()

    def enabled():
        if not settings.live_enabled or not settings.configured:raise GatewayError("PROVIDER_DISABLED",503)

    async def disconnected(request,operation):
        task=asyncio.create_task(operation)
        try:
            while not task.done():
                if await request.is_disconnected():
                    task.cancel();raise asyncio.CancelledError()
                await asyncio.wait({task},timeout=.05)
            return await task
        finally:
            if not task.done():task.cancel()
            await asyncio.gather(task,return_exceptions=True)

    async def business(request):
        owner=security.authenticate(request.headers.get("authorization",""))
        wire=validate_wire(await strict_body(request,WIRE_FIELDS))
        if wire["traceId"] in traces:raise GatewayError("INPUT_BLOCKED")
        traces.add(wire["traceId"])
        enabled()
        return owner,wire

    def envelope(wire,result):
        return {"schemaVersion":"1.0","algorithmVersion":wire["algorithmVersion"],"promptVersion":wire["promptVersion"],
                "traceId":wire["traceId"],"inputHash":wire["inputHash"],"domainRevision":wire["domainRevision"],
                "requestedMode":"LIVE","effectiveMode":"LIVE","origin":"MODEL","fallbackReason":None,
                "usage":result["usage"],"guard":{"passed":True,"masked":True,"flags":[]},"data":result["data"]}

    @app.middleware("http")
    async def boundaries(request, call_next):
        try:
            if request.headers.get("host")!=HOST or request.headers.get("cookie"):
                raise GatewayError("INPUT_BLOCKED",403)
            origin=request.headers.get("origin")
            if origin != ORIGIN and not (request.method=="GET" and request.url.path=="/health" and origin is None):
                raise GatewayError("INPUT_BLOCKED",403)
            if request.method=="OPTIONS":
                wanted={h.strip().lower() for h in request.headers.get("access-control-request-headers","").split(",") if h.strip()}
                if request.headers.get("access-control-request-method") not in ("GET","POST") or not wanted<={"content-type","authorization"}:
                    raise GatewayError("INPUT_BLOCKED",403)
                return Response(status_code=204,headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"GET, POST","Access-Control-Allow-Headers":"Content-Type, Authorization","Vary":"Origin"})
            if request.method=="POST":
                if request.headers.get("content-type","").split(";")[0].strip().lower()!="application/json":
                    raise GatewayError("INPUT_BLOCKED",415)
                total=0; chunks=[]
                async for chunk in request.stream():
                    total+=len(chunk)
                    if total>65536: raise GatewayError("INPUT_BLOCKED",413)
                    chunks.append(chunk)
                request._body=b"".join(chunks)
            result=await call_next(request)
        except GatewayError as error:
            result=safe_error(error)
        result.headers.update({"Access-Control-Allow-Origin":ORIGIN,"Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"})
        return result

    @app.exception_handler(GatewayError)
    async def gateway_error(_request,error):
        return safe_error(error)

    @app.get("/health")
    async def health():
        return {"status":"ok","gatewayVersion":"1.0"}

    @app.post("/api/pair")
    async def pair(request:Request):
        body=await strict_body(request,{"code"})
        if not isinstance(body["code"],str) or len(body["code"])!=8 or not body["code"].isascii() or not body["code"].isdigit():
            raise GatewayError("PAIRING_FAILED",401)
        return security.pair(body["code"])

    @app.get("/api/ai/providers")
    async def providers(request:Request):
        security.authenticate(request.headers.get("authorization",""))
        return {"providerId":"deepseek","model":settings.model,"configured":settings.configured,
                "liveEnabled":settings.live_enabled,"gatewayInstanceId":security.instance_id}

    @app.post("/api/ai/test")
    async def test(request:Request):
        security.authenticate(request.headers.get("authorization",""))
        body=await strict_body(request,{"confirmPaidCall"})
        if body["confirmPaidCall"] is not True: raise GatewayError("INPUT_BLOCKED")
        enabled()
        owner=security.authenticate(request.headers.get("authorization",""))
        return await disconnected(request,limits.run(owner,adapter.estimate(),32,adapter.test))

    @app.post("/api/ai/structured")
    async def structured(request:Request):
        owner,wire=await business(request)
        async def work(accounting):return await adapter.complete(wire,accounting)
        result=await disconnected(request,limits.run(owner,adapter.estimate(wire),1200,work))
        return envelope(wire,result)

    @app.post("/api/ai/chat")
    async def chat(request:Request):
        owner,wire=await business(request)
        queue=asyncio.Queue(maxsize=4)
        async def delta(text):await queue.put(("text_delta",{"delta":text}))
        async def produce():
            try:
                async def work(accounting):return await adapter.stream(wire,delta,accounting)
                result=await limits.run(owner,adapter.estimate(wire),1200,work)
                await queue.put(("final",envelope(wire,result)))
            except GatewayError as error:await queue.put(("error",error))
            except asyncio.CancelledError:raise
            except Exception:await queue.put(("error",GatewayError("UPSTREAM_ERROR",502)))
        task=asyncio.create_task(produce())
        try:
            first=await disconnected(request,queue.get())
        except BaseException:
            task.cancel();await asyncio.gather(task,return_exceptions=True);raise
        if first[0]=="error":
            await task
            return safe_error(first[1],wire["traceId"])
        async def events():
            item=first;counter=0
            try:
                while True:
                    kind,value=item;counter+=1
                    if kind=="error":value=json.loads(safe_error(value,wire["traceId"]).body)
                    yield f"id: {counter}\nevent: {kind}\ndata: {json.dumps(value,ensure_ascii=False,separators=(',',':'))}\n\n"
                    if kind in ("final","error"):break
                    item=await queue.get()
            finally:
                if not task.done():task.cancel()
                await asyncio.gather(task,return_exceptions=True)
        return StreamingResponse(events(),media_type="text/event-stream",headers={"Cache-Control":"no-store","X-Accel-Buffering":"no"})

    @app.post("/api/unpair")
    async def unpair(request:Request):
        digest=security.authenticate(request.headers.get("authorization",""))
        await strict_body(request,set())
        security.unpair(digest)
        limits.cancel_owner(digest)
        return Response(status_code=204)

    return app
