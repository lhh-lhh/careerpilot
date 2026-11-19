import hashlib
import secrets
import time
from datetime import datetime, timezone
from .errors import GatewayError

class Pairing:
    def __init__(self, instance_id, clock=time.monotonic):
        self.instance_id, self.clock = instance_id, clock
        self.pair_code = f"{secrets.randbelow(100_000_000):08d}"
        self.created = clock()
        self.attempts = 0
        self.used = False
        self._tokens = {}

    def pair(self, code):
        allowed = not self.used and self.attempts < 5 and self.clock()-self.created < 300
        if not allowed or not secrets.compare_digest(code, self.pair_code):
            self.attempts += 1
            raise GatewayError("PAIRING_FAILED",401)
        self.used = True
        token = secrets.token_urlsafe(32)
        self._tokens[hashlib.sha256(token.encode()).hexdigest()] = self.clock()+1800
        return {"token":token,"expiresAt":datetime.fromtimestamp(time.time()+1800,timezone.utc).isoformat(),
                "gatewayInstanceId":self.instance_id}

    def authenticate(self, header):
        if not header.startswith("Bearer "):
            raise GatewayError("PAIRING_REQUIRED",401)
        digest = hashlib.sha256(header[7:].encode()).hexdigest()
        if self._tokens.get(digest,0) <= self.clock():
            self._tokens.pop(digest,None)
            raise GatewayError("PAIRING_REQUIRED",401)
        return digest

    def unpair(self, digest):
        self._tokens.pop(digest,None)
