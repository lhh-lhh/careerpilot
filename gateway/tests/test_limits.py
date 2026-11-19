import asyncio
import pytest
from app.limits import Limits
from app.errors import GatewayError

async def successful(accounting):
    accounting.update(sent=True,usage={"prompt":1,"completion":1})
    return "ok"

async def test_two_active_four_waiting_no_hidden_extra_admission():
    limits=Limits();entered=asyncio.Queue();release=asyncio.Event()
    async def work(accounting):
        accounting["sent"]=True;await entered.put("started");await release.wait();return "done"
    first=[asyncio.create_task(limits.run("owner",300,1200,work)) for _ in range(2)]
    await asyncio.wait_for(entered.get(),.2);await asyncio.wait_for(entered.get(),.2)
    waiting=[asyncio.create_task(limits.run("owner",300,1200,work)) for _ in range(4)]
    await asyncio.sleep(0)
    with pytest.raises(GatewayError) as caught:await limits.run("owner",300,1200,work)
    assert caught.value.code=="QUEUE_FULL"
    assert limits.attempts==2 and entered.empty()
    release.set();assert await asyncio.gather(*first,*waiting)==["done"]*6
    assert limits.active==0 and limits.waiting==0

async def test_wait_timeout_and_cancellation_do_not_send_or_consume_budget():
    limits=Limits(queue_timeout=.02);entered=asyncio.Queue();release=asyncio.Event()
    async def work(accounting):accounting["sent"]=True;await entered.put(True);await release.wait()
    first=[asyncio.create_task(limits.run("owner",100,1200,work)) for _ in range(2)]
    await asyncio.wait_for(entered.get(),.2);await asyncio.wait_for(entered.get(),.2)
    with pytest.raises(GatewayError) as caught:await limits.run("owner",100,1200,work)
    assert caught.value.code=="QUEUE_TIMEOUT" and limits.attempts==2
    waiter=asyncio.create_task(limits.run("other",100,1200,work));await asyncio.sleep(0);waiter.cancel()
    with pytest.raises(asyncio.CancelledError):await waiter
    assert limits.waiting==0
    limits.cancel_owner("owner")
    await asyncio.gather(*first,return_exceptions=True)
    assert limits.active==0 and limits.charged==200

async def test_rolling_rate_process_attempt_and_truthful_unknown_usage():
    now=[0.0];limits=Limits(clock=lambda:now[0])
    for _ in range(10):assert await limits.run("owner",100,32,successful)=="ok"
    with pytest.raises(GatewayError) as caught:await limits.run("owner",100,32,successful)
    assert caught.value.code=="RATE_LIMITED" and limits.attempts==10
    now[0]=61
    for _ in range(10):await limits.run("owner",100,32,successful)
    now[0]=122
    with pytest.raises(GatewayError) as caught:await limits.run("new-owner",100,32,successful)
    assert caught.value.code=="BUDGET_EXCEEDED" and limits.attempts==20

async def test_reservations_prevent_second_inflight_from_crossing_soft_gate():
    limits=Limits();limits.charged=8800
    entered=asyncio.Event();release=asyncio.Event()
    async def work(accounting):accounting["sent"]=True;entered.set();await release.wait();return "ok"
    first=asyncio.create_task(limits.run("o",2000,1200,work));await asyncio.wait_for(entered.wait(),.2)
    with pytest.raises(GatewayError) as caught:await limits.run("o",2000,1200,successful)
    assert caught.value.code=="BUDGET_EXCEEDED" and limits.attempts==1
    release.set();await first
    assert limits.charged==10800 and limits.reserved==0

async def test_absolute_deadline_does_not_extend_with_chunks():
    limits=Limits(deadline=.03);closed=[]
    async def work(accounting):
        accounting["sent"]=True
        try:
            while True:await asyncio.sleep(.005)
        finally:closed.append(True)
    with pytest.raises(GatewayError) as caught:await limits.run("o",100,32,work)
    assert caught.value.code=="TIMEOUT" and closed==[True] and limits.charged==100
