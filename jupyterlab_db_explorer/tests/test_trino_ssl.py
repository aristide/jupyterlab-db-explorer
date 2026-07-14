"""Tests for SSL mode / HTTP scheme / timeout / extra connection options.

Covers the Trino password (LDAP) and JWT paths plus the per-dialect wiring
of the advanced form options (db_ssl_mode, db_conn_timeout, db_conn_opts).
"""
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from .. import engine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _install_fake_trino_module():
    """Stand-in `trino.auth` capturing what engine.py builds."""
    captured = {}

    class JWTAuthentication:
        def __init__(self, token):
            captured['token'] = token

    class BasicAuthentication:
        def __init__(self, username, password):
            captured['basic_user'] = username
            captured['basic_pass'] = password

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
    engine._temp_pass_store.clear()
    yield
    engine._temp_pass_store.clear()
    sys.modules.pop('trino.auth', None)
    sys.modules.pop('trino', None)


def _trino_engine_call(db, dbid='t'):
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        result = engine._getSQL_engine(dbid, db)
    return create_engine, result


# ---------------------------------------------------------------------------
# Option parsing
# ---------------------------------------------------------------------------


def test_conn_opts_parsing_and_coercion():
    db = {'db_conn_opts': (
        '# comment line\n'
        'source=jupyterlab\n'
        'verify=false; request_timeout=30\n'
        'ratio=1.5\n'
        'options=-c search_path=raw\n'
        'MultiSubnetFailover=yes\n'
        '   \n'
        'malformed-line\n'
    )}
    opts = engine._get_conn_opts(db)
    assert opts == {
        'source': 'jupyterlab',
        'verify': False,
        'request_timeout': 30,
        'ratio': 1.5,
        'options': '-c search_path=raw',
        # Only true/false coerce to bool — ODBC-style yes/no must stay
        # strings (drivers take them verbatim).
        'MultiSubnetFailover': 'yes',
    }


def test_conn_timeout_parsing():
    assert engine._get_conn_timeout({'db_conn_timeout': '15'}) == 15
    assert engine._get_conn_timeout({'db_conn_timeout': ''}) is None
    assert engine._get_conn_timeout({}) is None
    assert engine._get_conn_timeout({'db_conn_timeout': 'abc'}) is None
    assert engine._get_conn_timeout({'db_conn_timeout': '0'}) is None


def test_ssl_mode_normalization():
    assert engine._get_ssl_mode({'db_ssl_mode': 'Require '}) == 'require'
    assert engine._get_ssl_mode({'db_ssl_mode': 'bogus'}) is None
    assert engine._get_ssl_mode({}) is None


def test_trino_scheme_normalizes_and_ignores_garbage():
    # Case/whitespace are normalized; unrecognized values fall through to
    # the ssl-mode / credential / port-default chain instead of being sent
    # verbatim to the trino client.
    assert engine._trino_scheme({'db_http_scheme': ' HTTPS '}, secured=False) == 'https'
    assert engine._trino_scheme({'db_http_scheme': 'htttps'}, secured=True) == 'https'
    assert engine._trino_scheme({'db_http_scheme': 'ftp'}, secured=False) is None
    assert engine._trino_scheme({'db_http_scheme': 'ftp', 'db_ssl_mode': 'require'},
                                secured=False) == 'https'


# ---------------------------------------------------------------------------
# Trino password / LDAP path
# ---------------------------------------------------------------------------


def test_trino_password_defaults_to_https_basic_auth():
    captured = _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_port': '8443',
        'db_user': 'aristide',
        'db_pass': 'secret',
    }
    create_engine, _ = _trino_engine_call(db)
    url, = create_engine.call_args.args
    kwargs = create_engine.call_args.kwargs
    assert url == 'trino://aristide@trino.corp:8443'
    assert kwargs['connect_args']['http_scheme'] == 'https'
    # No SSL mode given → certificates are verified (no verify key).
    assert 'verify' not in kwargs['connect_args']
    assert captured['basic_user'] == 'aristide'
    assert captured['basic_pass'] == 'secret'


def test_trino_password_explicit_http_scheme_honored():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'localhost',
        'db_port': '8080',
        'db_user': 'dev',
        'db_pass': 'pw',
        'db_http_scheme': 'http',
    }
    create_engine, _ = _trino_engine_call(db)
    assert create_engine.call_args.kwargs['connect_args']['http_scheme'] == 'http'


def test_trino_ssl_mode_require_skips_cert_verification():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_port': '8443',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'require',
    }
    create_engine, _ = _trino_engine_call(db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['http_scheme'] == 'https'
    assert connect_args['verify'] is False


def test_trino_ssl_mode_verify_full_keeps_verification():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'verify-full',
    }
    create_engine, _ = _trino_engine_call(db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['http_scheme'] == 'https'
    assert 'verify' not in connect_args


def test_trino_conn_opts_override_derived_values():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'require',
        'db_conn_opts': 'verify=/etc/ssl/trino-ca.pem\nsource=jl-dbx',
    }
    create_engine, _ = _trino_engine_call(db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    # Extra options merge last: the CA bundle path replaces verify=False.
    assert connect_args['verify'] == '/etc/ssl/trino-ca.pem'
    assert connect_args['source'] == 'jl-dbx'


def test_trino_conn_timeout_becomes_request_timeout():
    _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_conn_timeout': '25',
    }
    create_engine, _ = _trino_engine_call(db)
    assert create_engine.call_args.kwargs['connect_args']['request_timeout'] == 25.0


def test_trino_no_auth_defaults_stay_port_driven():
    """No credentials + no options → no http_scheme in connect_args, so the
    trino client keeps its historical port-based default (443→https, else
    http). Only the raw username is passed through."""
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'localhost',
        'db_port': '8080',
    }
    create_engine, _ = _trino_engine_call(db)
    url, = create_engine.call_args.args
    assert url == 'trino://trino@localhost:8080'
    assert create_engine.call_args.kwargs['connect_args'] == {'user': 'trino'}


def test_trino_username_special_chars_survive():
    """The URL user slot is decoded twice (SQLAlchemy unquote, then the
    dialect's unquote_plus), so the raw username must ride in connect_args —
    otherwise 'dev+ops@corp.com' would reach the coordinator as
    'dev ops@corp.com'."""
    captured = _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'dev+ops@corp.com',
        'db_pass': 'pw',
    }
    create_engine, _ = _trino_engine_call(db)
    url, = create_engine.call_args.args
    assert url == 'trino://dev%2Bops%40corp.com@trino.corp:8080'
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['user'] == 'dev+ops@corp.com'
    assert captured['basic_user'] == 'dev+ops@corp.com'


def test_trino_jwt_gets_ssl_mode_and_timeout():
    captured = _install_fake_trino_module()
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_pass': 'tok',
        'db_auth_type': 'jwt',
        'db_ssl_mode': 'require',
        'db_conn_timeout': '12',
    }
    create_engine, _ = _trino_engine_call(db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['http_scheme'] == 'https'
    assert connect_args['verify'] is False
    assert connect_args['request_timeout'] == 12.0
    assert captured['token'] == 'tok'


# ---------------------------------------------------------------------------
# Trino password prompt flow (explicit-TLS + username, no stored password)
# ---------------------------------------------------------------------------


def test_check_pass_trino_tls_with_user_and_no_password_prompts():
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    with patch.object(engine, '_getDbInfo', return_value=cfg):
        ok, hint = engine.check_pass('ldap')
    assert ok is False
    assert hint == 'aristide'


def test_check_pass_trino_no_auth_never_prompts():
    """Regression guard: user-only http connections must stay prompt-free."""
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'localhost',
        'db_user': 'analyst',
    }
    with patch.object(engine, '_getDbInfo', return_value=cfg):
        ok, _ = engine.check_pass('noauth')
    assert ok is True


def test_trino_engine_uses_temp_store_password():
    captured = _install_fake_trino_module()
    engine._temp_pass_store['ldap'] = {'user': 'aristide', 'pwd': 'typed-pw'}
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_port': '8443',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    create_engine, _ = _trino_engine_call(db, dbid='ldap')
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['http_scheme'] == 'https'
    assert captured['basic_user'] == 'aristide'
    assert captured['basic_pass'] == 'typed-pw'


def test_trino_engine_prompts_without_password_when_tls_explicit():
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    create_engine, result = _trino_engine_call(db, dbid='ldap')
    assert result is None
    assert create_engine.call_count == 0


def test_test_connection_trino_tls_user_without_password_rejected():
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    ok, msg = engine.test_connection(db)
    assert ok is False
    assert 'password' in msg


def test_set_pass_round_trip_feeds_trino_basic_auth():
    """Full prompt flow: set_pass stores the credentials, getEngine consumes
    them, and a successful connect keeps the temp entry."""
    captured = _install_fake_trino_module()
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_port': '8443',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    fake_engine = MagicMock()
    with patch.object(engine, '_getDbInfo', return_value=cfg), \
         patch.object(engine.sqlalchemy, 'create_engine',
                      return_value=fake_engine) as create_engine:
        ok, msg = engine.set_pass('ldap', 'aristide', 'typed-pw')
    assert ok is True and msg is None
    assert create_engine.call_count == 1
    assert captured['basic_user'] == 'aristide'
    assert captured['basic_pass'] == 'typed-pw'
    assert 'ldap' in engine._temp_pass_store


def test_set_pass_failure_clears_temp_store():
    cfg = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_user': 'aristide',
        'db_http_scheme': 'https',
    }
    _install_fake_trino_module()
    fake_engine = MagicMock()
    fake_engine.connect.side_effect = Exception('401')
    with patch.object(engine, '_getDbInfo', return_value=cfg), \
         patch.object(engine.sqlalchemy, 'create_engine',
                      return_value=fake_engine):
        ok, _ = engine.set_pass('ldap', 'aristide', 'wrong')
    assert ok is False
    assert 'ldap' not in engine._temp_pass_store


def test_trino_jwt_without_token_returns_none_instead_of_raising():
    """input_passwd used to be an undefined name (NameError); a token-less
    JWT connection must now quietly yield no engine."""
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_auth_type': 'jwt',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        result = engine._getSQL_engine('jwt1', db)
    assert result is None
    assert create_engine.call_count == 0


def test_trino_jwt_token_from_temp_store():
    captured = _install_fake_trino_module()
    engine._temp_pass_store['jwt2'] = {'user': 'analyst', 'pwd': 'tok-typed'}
    db = {
        'db_type': engine.DB_TRINO,
        'db_host': 'trino.corp',
        'db_auth_type': 'jwt',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('jwt2', db)
    assert captured['token'] == 'tok-typed'
    url, = create_engine.call_args.args
    assert 'tok-typed' not in url


# ---------------------------------------------------------------------------
# Generic prompt flow: stored username + temp-store password
# ---------------------------------------------------------------------------


def test_pgsql_stored_user_uses_temp_store_password():
    engine._temp_pass_store['pg1'] = {'user': 'aristide', 'pwd': 'p w'}
    db = {
        'db_type': engine.DB_PGSQL,
        'db_host': 'pg.corp',
        'db_user': 'aristide',
        # no db_pass key: password comes from the UI prompt (temp store)
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('pg1', db)
    url, = create_engine.call_args.args
    assert url == 'postgresql://aristide:p+w@pg.corp:5432/postgres'


def test_pgsql_stored_user_without_any_password_returns_none():
    db = {
        'db_type': engine.DB_PGSQL,
        'db_host': 'pg.corp',
        'db_user': 'aristide',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        result = engine._getSQL_engine('pg2', db)
    assert result is None
    assert create_engine.call_count == 0


# ---------------------------------------------------------------------------
# Per-dialect SSL mode / timeout / opts wiring
# ---------------------------------------------------------------------------


def test_pgsql_ssl_mode_timeout_and_opts():
    db = {
        'db_type': engine.DB_PGSQL,
        'db_host': 'pg.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'verify-full',
        'db_conn_timeout': '7',
        'db_conn_opts': 'application_name=jl-dbx\nsslrootcert=/etc/ca.pem',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('pg', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args == {
        'sslmode': 'verify-full',
        'connect_timeout': 7,
        'application_name': 'jl-dbx',
        'sslrootcert': '/etc/ca.pem',
    }


def test_mysql_ssl_disable_and_timeout():
    db = {
        'db_type': engine.DB_MYSQL,
        'db_host': 'my.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'disable',
        'db_conn_timeout': '5',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('my', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args == {'ssl_disabled': True, 'connect_timeout': 5}


def test_mysql_ssl_require_enables_tls_without_verification():
    """The dict must be truthy: pymysql gates TLS on `if ssl:`, so an empty
    dict would silently mean no TLS at all (the exact bug this pins)."""
    db = {
        'db_type': engine.DB_MYSQL,
        'db_host': 'my.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'require',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('my', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args == {
        'ssl': {'verify_mode': False, 'check_hostname': False}
    }
    assert connect_args['ssl']  # truthy → pymysql actually negotiates TLS


def test_mysql_verify_modes_use_real_ssl_context():
    """verify-ca / verify-full pass an ssl.SSLContext: pymysql's dict path
    force-disables hostname checking when no custom CA is supplied, so the
    context is the only way to get verify-full against the system store."""
    import ssl as ssl_module

    def args_for(mode):
        db = {
            'db_type': engine.DB_MYSQL,
            'db_host': 'my.corp',
            'db_user': 'u',
            'db_pass': 'p',
            'db_ssl_mode': mode,
        }
        with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
            engine._getSQL_engine('my', db)
        return create_engine.call_args.kwargs['connect_args']

    ca = args_for('verify-ca')['ssl']
    assert isinstance(ca, ssl_module.SSLContext)
    assert ca.verify_mode == ssl_module.CERT_REQUIRED
    assert ca.check_hostname is False

    full = args_for('verify-full')['ssl']
    assert isinstance(full, ssl_module.SSLContext)
    assert full.verify_mode == ssl_module.CERT_REQUIRED
    assert full.check_hostname is True


def test_mysql_verify_ca_loads_custom_ca_bundle():
    db = {
        'db_type': engine.DB_MYSQL,
        'db_host': 'my.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'verify-ca',
        'db_conn_opts': 'ssl_ca=/etc/mysql-ca.pem',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine, \
         patch('ssl.create_default_context') as cdc:
        engine._getSQL_engine('my', db)
    cdc.assert_called_once_with(cafile='/etc/mysql-ca.pem')
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['ssl'] is cdc.return_value
    # The raw ssl_ca kwarg must not also be passed — pymysql would rebuild
    # its own ssl dict from it, clobbering the context.
    assert 'ssl_ca' not in connect_args


def test_mysql_require_with_custom_ca_keeps_hostname_check_off():
    """require + ssl_ca must fold the CA into the dict with check_hostname
    False — pymysql defaults it to True when a CA is present, and Python's
    ssl module rejects check_hostname together with CERT_NONE."""
    db = {
        'db_type': engine.DB_MYSQL,
        'db_host': 'my.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'require',
        'db_conn_opts': 'ssl_ca=/etc/mysql-ca.pem',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('my', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args['ssl'] == {
        'verify_mode': False,
        'check_hostname': False,
        'ca': '/etc/mysql-ca.pem',
    }
    assert 'ssl_ca' not in connect_args


def test_starrocks_password_path_gets_pymysql_args():
    db = {
        'db_type': engine.DB_STARROCKS,
        'db_host': 'sr.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_ssl_mode': 'require',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('sr', db)
    assert create_engine.call_args.kwargs['connect_args'] == {
        'ssl': {'verify_mode': False, 'check_hostname': False}
    }


def test_sqlserver_ssl_mode_mapping():
    base = {
        'db_type': engine.DB_SQLSERVER,
        'db_host': 'ms.corp',
        'db_user': 'u',
        'db_pass': 'p',
    }

    def url_for(extra):
        db = dict(base, **extra)
        with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
            engine._getSQL_engine('ms', db)
        return create_engine.call_args.args[0]

    # Historical default: encrypted, self-signed accepted.
    assert 'TrustServerCertificate=yes' in url_for({})
    assert 'TrustServerCertificate=yes' in url_for({'db_ssl_mode': 'require'})
    full = url_for({'db_ssl_mode': 'verify-full'})
    assert 'Encrypt=yes' in full and 'TrustServerCertificate' not in full
    assert 'Encrypt=no' in url_for({'db_ssl_mode': 'disable'})


def test_sqlserver_timeout_and_opts_in_connect_args():
    db = {
        'db_type': engine.DB_SQLSERVER,
        'db_host': 'ms.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_conn_timeout': '9',
        'db_conn_opts': 'ApplicationIntent=ReadOnly',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('ms', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args == {'timeout': 9, 'ApplicationIntent': 'ReadOnly'}


def test_hive_ldap_merges_conn_opts():
    db = {
        'db_type': engine.DB_HIVE_LDAP,
        'db_host': 'hive.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_conn_opts': 'kerberos_service_name=hive2',
    }
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine('hv', db)
    connect_args = create_engine.call_args.kwargs['connect_args']
    assert connect_args == {'auth': 'LDAP', 'kerberos_service_name': 'hive2'}


# ---------------------------------------------------------------------------
# Environment variable plumbing for the new fields
# ---------------------------------------------------------------------------


def test_db_conn_env_parses_ssl_mode_timeout_and_opts():
    env = {
        'DB_CONN_STATIN_TYPE': engine.DB_TRINO,
        'DB_CONN_STATIN_HOST': 'trino.corp',
        'DB_CONN_STATIN_PORT': '8443',
        'DB_CONN_STATIN_USER': 'aristide',
        'DB_CONN_STATIN_PASS': 'pw',
        'DB_CONN_STATIN_HTTP_SCHEME': 'https',
        'DB_CONN_STATIN_SSL_MODE': 'require',
        'DB_CONN_STATIN_TIMEOUT': '20',
        'DB_CONN_STATIN_OPTS': 'source=jl-dbx',
    }
    with patch.dict('os.environ', env, clear=False):
        conns = engine._getConns_from_env()
    assert 'STATIN' in conns
    statin = conns['STATIN']
    assert statin['db_ssl_mode'] == 'require'
    assert statin['db_conn_timeout'] == '20'
    assert statin['db_conn_opts'] == 'source=jl-dbx'
    # '_SSL_MODE' must not be parsed as conn 'STATIN_SSL' field 'MODE'.
    assert 'STATIN_SSL' not in conns


def test_single_env_loads_ssl_mode_timeout_and_opts():
    env = {
        'DB_TYPE': engine.DB_TRINO,
        'DB_HOST': 'trino.corp',
        'DB_SSL_MODE': 'require',
        'DB_CONN_TIMEOUT': '30',
        'DB_CONN_OPTS': 'verify=false',
    }
    with patch.dict('os.environ', env, clear=False):
        info = engine.load_from_env_single()
    assert info['db_ssl_mode'] == 'require'
    assert info['db_conn_timeout'] == '30'
    assert info['db_conn_opts'] == 'verify=false'


def test_db_list_from_env_skips_new_singletons():
    env = {'DB_SSL_MODE': 'require', 'DB_CONN_TIMEOUT': '5', 'DB_CONN_OPTS': 'a=b'}
    with patch.dict('os.environ', env, clear=False):
        names = engine._getDBlist_from_env()
    assert 'SSL_MODE' not in names
    # DB_CONN_* singles are covered by the DB_CONN_ prefix exclusion.
    assert all(not n.startswith('CONN_') for n in names)


def test_db_list_from_env_skips_all_explorer_tuning_vars():
    """DB_EXPLORER_* tuning vars must never be parsed as phantom base64
    connections — getDbInfo on them would crash on base64/JSON decoding."""
    env = {
        'DB_EXPLORER_QUERY_LIMIT': '100000',
        'DB_EXPLORER_RESULT_TTL_SEC': '600',
        'DB_EXPLORER_SOME_FUTURE_KNOB': 'x',
    }
    with patch.dict('os.environ', env, clear=False):
        names = engine._getDBlist_from_env()
    assert all(not n.startswith('EXPLORER_') for n in names)
