"""CLI-only runtime. Never imported to read settings during offline boot."""
import asyncio
import json
import os
import sys
import uuid
import uvicorn
from .config import load_settings
from .errors import GatewayError
from .main import create_app

async def main():
    if not ((3,11)<=sys.version_info[:2]<(3,14)):
        print("GATEWAY_PYTHON_UNSUPPORTED",flush=True);return 1
    try:settings=load_settings()
    except GatewayError:
        print("PROVIDER_CONFIG_ERROR",flush=True);return 1
    instance=os.environ.get("CAREERPILOT_INSTANCE_ID") or uuid.uuid4().hex
    app=create_app(settings)
    app.state.security.instance_id=instance
    server=uvicorn.Server(uvicorn.Config(app,host="127.0.0.1",port=8787,access_log=False,log_level="critical",server_header=False))
    running=asyncio.create_task(server.serve())
    while not server.started:
        if running.done():await running;return 1
        await asyncio.sleep(.02)
    print("CAREERPILOT_READY "+json.dumps({"instanceId":instance,"port":8787,"pid":os.getpid(),"status":"enabled" if settings.configured and settings.live_enabled else "disabled"}),flush=True)
    # Code is terminal-only, never an API response, file, or persistent log.
    print("本机一次性配对码："+app.state.security.pair_code+"（5分钟有效；请勿截图分享）",file=sys.stderr,flush=True)
    await running
    return 0

if __name__=="__main__":raise SystemExit(asyncio.run(main()))
