import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import dotenv_values
from pydantic import SecretStr
from .errors import GatewayError

@dataclass(frozen=True)
class Settings:
    provider: str
    base_url: str
    model: str
    api_key: SecretStr
    live_enabled: bool
    source: str

    @property
    def configured(self):
        return bool(self.api_key.get_secret_value())

def load_settings(*, environ=None, env_file=None):
    process = dict(os.environ if environ is None else environ)
    path = Path(env_file) if env_file is not None else Path(__file__).resolve().parents[1]/".env"
    values = {**(dotenv_values(path, interpolate=False) if path.is_file() else {}), **process}
    def get(key, default):
        return values.get(key, default) or ""
    provider = get("AI_PROVIDER", "deepseek").strip()
    raw_url = get("AI_BASE_URL", "https://api.deepseek.com").strip()
    model = get("AI_MODEL", "deepseek-flash").strip()
    enabled = get("AI_LIVE_ENABLED", "false").strip().lower()
    key = get("AI_API_KEY", "").strip()
    try:
        url = urlsplit(raw_url)
        valid = (url.scheme == "https" and url.hostname == "api.deepseek.com" and
                 url.port in (None, 443) and not url.username and not url.password and
                 not url.query and not url.fragment and url.path in ("", "/") and
                 "?" not in raw_url and "#" not in raw_url)
    except ValueError:
        valid = False
    if (provider != "deepseek" or not valid or not re.fullmatch(r"[A-Za-z0-9._-]{1,100}",model)
            or enabled not in ("true", "false") or "\n" in key or "\r" in key):
        raise GatewayError("PROVIDER_CONFIG_ERROR")
    return Settings(provider,"https://api.deepseek.com",model,SecretStr(key),enabled=="true",
                    "process" if any(k.startswith("AI_") for k in process) else "file")
