import pytest
from app.config import load_settings
from app.errors import GatewayError

def test_empty_config_is_disabled_and_never_reads_default_env(tmp_path):
    settings=load_settings(environ={},env_file=tmp_path/"absent")
    assert not settings.live_enabled
    assert not settings.configured
    assert settings.base_url=="https://api.deepseek.com"
    assert settings.model=="deepseek-flash"

def test_process_config_wins_without_logging_secrets(tmp_path):
    path=tmp_path/"fake.env"
    path.write_text("AI_MODEL=from-file\nAI_API_KEY=fake-file-key\nAI_LIVE_ENABLED=true",encoding="utf-8")
    settings=load_settings(environ={"AI_MODEL":"from-process","AI_API_KEY":"fake-process-key"},env_file=path)
    assert settings.model=="from-process"
    assert settings.api_key.get_secret_value()=="fake-process-key"
    assert "fake-process-key" not in repr(settings)

@pytest.mark.parametrize("field,value",[("AI_PROVIDER","other"),("AI_BASE_URL","http://api.deepseek.com"),("AI_BASE_URL","https://evil.invalid"),("AI_BASE_URL","https://api.deepseek.com@evil.invalid"),("AI_BASE_URL","https://api.deepseek.com:444"),("AI_BASE_URL","https://api.deepseek.com/?x=y"),("AI_MODEL","bad/model"),("AI_LIVE_ENABLED","1"),("AI_API_KEY","fake\nsecret")])
def test_invalid_config_has_safe_error(field,value,tmp_path):
    with pytest.raises(GatewayError) as caught:
        load_settings(environ={field:value,"AI_LIVE_ENABLED":"true"} if field!="AI_LIVE_ENABLED" else {field:value},env_file=tmp_path/"none")
    assert caught.value.code=="PROVIDER_CONFIG_ERROR"
    assert value not in str(caught.value)
