"""Tests for JWT auth on Trino & StarRocks (db_auth_type='jwt')."""
import sys
import types
from unittest.mock import patch, MagicMock

import pytest

from .. import engine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _install_fake_trino_module():
    """Provide a stand-in `trino.auth` so engine.py's lazy import succeeds.

    The real trino package isn't an install requirement of the explorer's
    test extra, so we synthesize the minimal shape engine._getSQL_engine
    reaches for: trino.auth.JWTAuthentication(token).
    """
    captured = {}

    class JWTAuthentication:
        def __init__(self, token):
            captured['token'] = token

        def __repr__(self):
            return f'JWTAuth({captured.get("token")!r})'

    class BasicAuthentication:
        def __init__(self, username, password):
            captured['basic_user'] = username
            captured['basic_pass'] = password

        def __repr__(self):
            return f'BasicAuth({captured.get("basic_user")!r})'

    trino_mod = types.ModuleType('trino')
    auth_mod = types.ModuleType('trino.auth')
    auth_mod.JWTAuthentication = JWTAuthentication
    auth_mod.BasicAuthentication = BasicAuthentication
    trino_mod.auth = auth_mod
    sys.modules['trino'] = trino_mod
    sys.modules['trino.auth'] = auth_mod
    return captured


@pytest.fixture(autouse=True)
def _isolate_module_state():
    """Reset per-test global state in the engine module."""
    engine._temp_pass_store.clear()
    yield
    engine._temp_pass_store.clear()
    # Tear down any fake trino module we installed.
    sys.modules.pop('trino.auth', None)
    sys.modules.pop('trino', None)


# ---------------------------------------------------------------------------
# Trino + JWT
# ---------------------------------------------------------------------------


def test_trino_jwt_engine_uses_jwt_auth_and_https():
    captured = _install_fake_trino_module()

    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.example.com',
        'db_port': '443',
        'db_user': 'analyst',
        'db_pass': 'token-xyz',
        'db_auth_type': 'jwt',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('t1', db)

    assert create_engine.call_count == 1
    url, = create_engine.call_args.args
    kwargs = create_engine.call_args.kwargs
    # The URL must not embed the token in the password slot — the bearer
    # belongs in connect_args. user@host with no `:password@` part.
    assert url == 'trino://analyst@trino.example.com:443'
    assert kwargs['connect_args']['http_scheme'] == 'https'
    # The auth object should have been built with our token.
    assert captured['token'] == 'token-xyz'


def test_trino_jwt_username_defaults_when_missing():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.example.com',
        'db_port': '443',
        'db_pass': 'token-xyz',
        'db_auth_type': 'jwt',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('t2', db)
    url, = create_engine.call_args.args
    assert url == 'trino://trino@trino.example.com:443'


def test_trino_jwt_honors_http_scheme_override():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'localhost',
        'db_port': '8080',
        'db_pass': 'tok',
        'db_auth_type': 'jwt',
        'db_http_scheme': 'http',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('t3', db)
    kwargs = create_engine.call_args.kwargs
    assert kwargs['connect_args']['http_scheme'] == 'http'


def test_trino_jwt_resolves_vault_token():
    captured = _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.example.com',
        'db_port': '443',
        'db_user': 'analyst',
        'db_pass': 'vault://prod/trino#jwt',
        'db_auth_type': 'jwt',
    }
    vault_client = MagicMock()
    vault_client.is_authenticated.return_value = True
    vault_client.secrets.kv.v2.read_secret_version.return_value = {
        'data': {'data': {'jwt': 'resolved-token'}}
    }
    with patch.object(engine, '_get_vault_client', return_value=vault_client), \
         patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('t4', db)
    # The resolved token should have been handed to JWTAuthentication, not
    # the placeholder URL.
    assert captured['token'] == 'resolved-token'
    url, = create_engine.call_args.args
    assert 'vault://' not in url
    assert ':' not in url.split('@')[0].split('//')[-1]  # no password in URL


def test_trino_password_path_uses_basic_auth_not_url_password():
    """The password/LDAP path must never embed the password in the URL: the
    trino dialect picks plain HTTP for any port other than 443 and ignores
    ?http_scheme= in the URL query, so URL credentials would ride cleartext
    to a TLS-only coordinator. See test_trino_ssl.py for the full matrix."""
    captured = _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.example.com',
        'db_port': '8443',
        'db_user': 'analyst',
        'db_pass': 'pw',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('t5', db)
    url, = create_engine.call_args.args
    assert url == 'trino://analyst@trino.example.com:8443'
    connect_args = create_engine.call_args.kwargs['connect_args']
    # Password auth implies TLS on standard Trino deployments.
    assert connect_args['http_scheme'] == 'https'
    assert captured['basic_user'] == 'analyst'
    assert captured['basic_pass'] == 'pw'


# ---------------------------------------------------------------------------
# StarRocks + JWT
# ---------------------------------------------------------------------------


def test_starrocks_jwt_embeds_token_as_password():
    db = {
        'db_type': engine.DB_STARROCKS,
        'db_host': 'sr.example.com',
        'db_port': '9030',
        'db_name': 'analytics',
        'db_user': 'svc_jwt',
        'db_pass': 'tok+/=value',  # exercise URL-encoding
        'db_auth_type': 'jwt',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('s1', db)
    url, = create_engine.call_args.args
    # Token should be URL-quoted; reserved characters must be percent-encoded.
    assert url.startswith('mysql+pymysql://svc_jwt:tok%2B%2F%3Dvalue@')
    assert url.endswith('@sr.example.com:9030/analytics')


def test_starrocks_jwt_requires_username():
    db = {
        'db_type': engine.DB_STARROCKS,
        'db_host': 'sr.example.com',
        'db_port': '9030',
        'db_pass': 'tok',
        'db_auth_type': 'jwt',
    }
    with pytest.raises(ValueError, match='username'):
        engine._getSQL_engine('s2', db)


# ---------------------------------------------------------------------------
# check_pass / test_connection
# ---------------------------------------------------------------------------


def test_check_pass_jwt_trino_needs_token():
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'h',
        'db_auth_type': 'jwt',
    }
    with patch.object(engine, '_getDbInfo', return_value=cfg):
        ok, _hint = engine.check_pass('jt')
        assert ok is False


def test_check_pass_jwt_trino_ok_when_token_present():
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'h',
        'db_auth_type': 'jwt',
        'db_pass': 'tok',
    }
    with patch.object(engine, '_getDbInfo', return_value=cfg):
        ok, _hint = engine.check_pass('jt2')
        assert ok is True


def test_test_connection_jwt_rejects_unresolved_vault_token():
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'h',
        'db_pass': 'vault://x#y',  # vault unreachable → stays as-is
        'db_auth_type': 'jwt',
    }
    with patch.object(engine, '_get_vault_client', return_value=None):
        ok, msg = engine.test_connection(db)
    assert ok is False
    assert 'JWT' in msg


# ---------------------------------------------------------------------------
# Environment variable plumbing
# ---------------------------------------------------------------------------


def test_db_conn_env_parses_auth_type_and_http_scheme():
    env = {
        'DB_CONN_PROD_TYPE': engine.DB_TRINO,
        'DB_CONN_PROD_HOST': 'trino.example.com',
        'DB_CONN_PROD_PORT': '443',
        'DB_CONN_PROD_USER': 'analyst',
        'DB_CONN_PROD_PASS': 'token-xyz',
        'DB_CONN_PROD_AUTH_TYPE': 'jwt',
        'DB_CONN_PROD_HTTP_SCHEME': 'https',
    }
    with patch.dict('os.environ', env, clear=False):
        conns = engine._getConns_from_env()
    # Critical: '_AUTH_TYPE' must not be parsed as conn 'PROD_AUTH', field 'TYPE'.
    assert 'PROD' in conns
    assert 'PROD_AUTH' not in conns
    prod = conns['PROD']
    assert prod['db_type'] == engine.DB_TRINO
    assert prod['db_auth_type'] == 'jwt'
    assert prod['db_http_scheme'] == 'https'
    assert prod['db_pass'] == 'token-xyz'


def test_single_env_loads_auth_type_and_scheme():
    env = {
        'DB_TYPE': engine.DB_TRINO,
        'DB_HOST': 'trino.example.com',
        'DB_USER': 'analyst',
        'DB_PASS': 'tok',
        'DB_AUTH_TYPE': 'jwt',
        'DB_HTTP_SCHEME': 'http',
    }
    with patch.dict('os.environ', env, clear=False):
        info = engine.load_from_env_single()
    assert info['db_auth_type'] == 'jwt'
    assert info['db_http_scheme'] == 'http'


def test_db_list_from_env_skips_jwt_singletons():
    """DB_AUTH_TYPE / DB_HTTP_SCHEME are config, not base64-conn entries."""
    env = {
        'DB_AUTH_TYPE': 'jwt',
        'DB_HTTP_SCHEME': 'https',
    }
    with patch.dict('os.environ', env, clear=False):
        names = engine._getDBlist_from_env()
    assert 'AUTH_TYPE' not in names
    assert 'HTTP_SCHEME' not in names
