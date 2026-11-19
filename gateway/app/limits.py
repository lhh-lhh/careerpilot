import asyncio
import time
from collections import deque
from .errors import GatewayError

class Limits:
    def __init__(self, *, clock=time.monotonic, queue_timeout=8, deadline=8):
        self.clock,self.queue_timeout,self.deadline=clock,queue_timeout,deadline
        self.active=self.waiting=self.attempts=self.charged=self.reserved=0
        self._semaphore=asyncio.Semaphore(2)
        self._recent=deque()
        self._owners={}

    def cancel_owner(self,owner):
        for task in tuple(self._owners.get(owner,set())):task.cancel()

    def cancel_all(self):
        for tasks in tuple(self._owners.values()):
            for task in tuple(tasks):task.cancel()

    async def run(self,owner,estimate,reservation,work):
        task=asyncio.current_task()
        self._owners.setdefault(owner,set()).add(task)
        acquired=False;admitted=False;attempt=None
        accounting={"sent":False,"usage":None}
        try:
            if self._semaphore.locked():
                if self.waiting>=4:raise GatewayError("QUEUE_FULL",429)
                self.waiting+=1
                try:await asyncio.wait_for(self._semaphore.acquire(),self.queue_timeout)
                except TimeoutError:raise GatewayError("QUEUE_TIMEOUT",504) from None
                finally:self.waiting-=1
            else:await self._semaphore.acquire()
            acquired=True;self.active+=1
            now=self.clock()
            while self._recent and self._recent[0][0]<=now-60:self._recent.popleft()
            if self.attempts>=20 or self.charged+self.reserved>=10000:raise GatewayError("BUDGET_EXCEEDED",429)
            if len(self._recent)>=10:raise GatewayError("RATE_LIMITED",429)
            attempt=(now,object());self._recent.append(attempt)
            self.attempts+=1;self.reserved+=reservation;admitted=True
            try:
                async with asyncio.timeout(self.deadline):return await work(accounting)
            except TimeoutError:raise GatewayError("TIMEOUT",504) from None
        finally:
            if admitted:
                self.reserved-=reservation
                if accounting["sent"]:
                    usage=accounting["usage"]
                    self.charged+=usage["prompt"]+usage["completion"] if usage is not None else estimate
                else:
                    self.attempts-=1
                    if attempt in self._recent:self._recent.remove(attempt)
            if acquired:
                self.active-=1;self._semaphore.release()
            self._owners[owner].discard(task)
            if not self._owners[owner]:self._owners.pop(owner)
