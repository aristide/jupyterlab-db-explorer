"""Tests for Hive-over-TLS (SASL PLAIN on TSSLSocket via a creator) and the
ignored-advanced-option warnings for Oracle / Kerberos Hive / plain Hive."""
import logging
import ssl as ssl_module
import sys
import types
from unittest.mock import patch

import pytest

from .. import engine


# ---------------------------------------------------------------------------
# Fake pyhive / thrift / thrift_sasl stack
# ---------------------------------------------------------------------------


def _install_fake_hive_stack():
    captured = {}

    class FakeConnection:
        def __init__(self, **kwargs):
            captured['conn_kwargs'] = kwargs

    def get_installed_sasl(**kwargs):
        captured['sasl_kwargs'] = kwargs
        return 'sasl-client'

    class FakeTSSLSocket:
        def __init__(self, host=None, port=None, ssl_context=None):
            captured['socket'] = self
            self.host = host
            self.port = port
            self.ssl_context = ssl_context
            self.timeout_ms = None

        def setTimeout(self, ms):
            self.timeout_ms = ms

    class FakeTSaslClientTransport:
        def __init__(self, sasl_client_factory, mechanism, trans):
            captured['sasl_factory'] = sasl_client_factory
            captured['mechanism'] = mechanism
            captured['wrapped_socket'] = trans

    pyhive_mod = types.ModuleType('pyhive')
    hive_mod = types.ModuleType('pyhive.hive')
    hive_mod.Connection = FakeConnection
    hive_mod.get_installed_sasl = get_installed_sasl
    pyhive_mod.hive = hive_mod

    thrift_mod = types.ModuleType('thrift')
    transport_pkg = types.ModuleType('thrift.transport')
    tssl_mod = types.ModuleType('thrift.transport.TSSLSocket')
    tssl_mod.TSSLSocket = FakeTSSLSocket
    transport_pkg.TSSLSocket = tssl_mod
    thrift_mod.transport = transport_pkg

    tsasl_mod = types.ModuleType('thrift_sasl')
    tsasl_mod.TSaslClientTransport = FakeTSaslClientTransport

    for name, mod in {
        'pyhive': pyhive_mod,
        'pyhive.hive': hive_mod,
        'thrift': thrift_mod,
        'thrift.transport': transport_pkg,
        'thrift.transport.TSSLSocket': tssl_mod,
        'thrift_sasl': tsasl_mod,
    }.items():
        sys.modules[name] = mod
    return captured


_FAKE_MODULES = (
    'pyhive', 'pyhive.hive', 'thrift', 'thrift.transport',
    'thrift.transport.TSSLSocket', 'thrift_sasl',
)


@pytest.fixture(autouse=True)
def _isolate_module_state():
    engine._temp_pass_store.clear()
    yield
    engine._temp_pass_store.clear()
    for name in _FAKE_MODULES:
        sys.modules.pop(name, None)


def _hive_db(**extra):
    db = {
        'db_type': engine.DB_HIVE_LDAP,
        'db_host': 'hive.corp',
        'db_port': '10001',
        'db_user': 'aristide',
        'db_pass': 'ldap-pw',
        'db_name': 'sales',
    }
    db.update(extra)
    return db


def _build(db, dbid='hv'):
    with patch.object(engine.sqlalchemy, 'create_engine') as create_engine:
        engine._getSQL_engine(dbid, db)
    return create_engine


# ---------------------------------------------------------------------------
# Hive TLS path
# ---------------------------------------------------------------------------


def test_hive_tls_require_builds_sasl_over_tsslsocket():
    captured = _install_fake_hive_stack()
    create_engine = _build(_hive_db(db_ssl_mode='require'))

    url, = create_engine.call_args.args
    # No credentials in the URL — the creator makes the connection.
    assert url == 'hive://hive.corp:10001/sales'
    creator = create_engine.call_args.kwargs['creator']
    assert callable(creator)
    assert 'connect_args' not in create_engine.call_args.kwargs

    creator()
    sock = captured['socket']
    assert (sock.host, sock.port) == ('hive.corp', 10001)
    ctx = sock.ssl_context
    assert isinstance(ctx, ssl_module.SSLContext)
    assert ctx.verify_mode == ssl_module.CERT_NONE
    assert ctx.check_hostname is False

    assert captured['mechanism'] == 'PLAIN'
    assert captured['wrapped_socket'] is sock
    # The SASL factory must carry the raw LDAP credentials.
    captured['sasl_factory']()
    assert captured['sasl_kwargs'] == {
        'host': 'hive.corp', 'sasl_auth': 'PLAIN',
        'username': 'aristide', 'password': 'ldap-pw',
    }
    assert captured['conn_kwargs']['username'] == 'aristide'
    assert captured['conn_kwargs']['database'] == 'sales'
    assert 'thrift_transport' in captured['conn_kwargs']


def test_hive_tls_verify_full_checks_hostname():
    captured = _install_fake_hive_stack()
    create_engine = _build(_hive_db(db_ssl_mode='verify-full'))
    create_engine.call_args.kwargs['creator']()
    ctx = captured['socket'].ssl_context
    assert ctx.verify_mode == ssl_module.CERT_REQUIRED
    assert ctx.check_hostname is True


def test_hive_tls_verify_ca_loads_custom_ca():
    captured = _install_fake_hive_stack()
    create_engine = _build(
        _hive_db(db_ssl_mode='verify-ca', db_conn_opts='ssl_ca=/etc/hive-ca.pem')
    )
    with patch('ssl.create_default_context') as cdc:
        cdc.return_value.check_hostname = True
        create_engine.call_args.kwargs['creator']()
    cdc.assert_called_once_with(cafile='/etc/hive-ca.pem')
    assert captured['socket'].ssl_context is cdc.return_value
    # ssl_ca must not leak into the Connection kwargs.
    assert 'ssl_ca' not in captured['conn_kwargs']


def test_hive_tls_timeout_applies_to_socket():
    captured = _install_fake_hive_stack()
    create_engine = _build(_hive_db(db_ssl_mode='require', db_conn_timeout='7'))
    create_engine.call_args.kwargs['creator']()
    assert captured['socket'].timeout_ms == 7000


def test_hive_tls_creator_builds_fresh_transport_per_connection():
    captured = _install_fake_hive_stack()
    create_engine = _build(_hive_db(db_ssl_mode='require'))
    creator = create_engine.call_args.kwargs['creator']
    creator()
    first = captured['socket']
    creator()
    assert captured['socket'] is not first


def test_hive_tls_uses_prompted_password_from_temp_store():
    captured = _install_fake_hive_stack()
    engine._temp_pass_store['hv'] = {'user': 'aristide', 'pwd': 'typed-pw'}
    db = _hive_db(db_ssl_mode='require')
    del db['db_pass']  # stored user, prompted password
    create_engine = _build(db)
    create_engine.call_args.kwargs['creator']()
    captured['sasl_factory']()
    assert captured['sasl_kwargs']['password'] == 'typed-pw'


def test_hive_without_ssl_mode_keeps_connect_args_path():
    create_engine = _build(_hive_db())
    kwargs = create_engine.call_args.kwargs
    assert 'creator' not in kwargs
    assert kwargs['connect_args'] == {'auth': 'LDAP'}


def test_hive_tls_missing_deps_raises_clear_error():
    # No fake stack installed and pyhive absent in the test env.
    with patch.object(engine.sqlalchemy, 'create_engine'):
        with pytest.raises(RuntimeError, match=r'pyhive\[hive\]>=0.7'):
            engine._getSQL_engine('hv', _hive_db(db_ssl_mode='require'))


# ---------------------------------------------------------------------------
# Ignored-option warnings
# ---------------------------------------------------------------------------


def test_oracle_warns_when_ssl_and_timeout_are_set(caplog):
    db = {
        'db_type': engine.DB_ORACLE,
        'db_host': 'ora.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_name': 'svc',
        'db_ssl_mode': 'require',
        'db_conn_timeout': '5',
    }
    with patch.object(engine.sqlalchemy, 'create_engine'), \
         caplog.at_level(logging.WARNING, logger='jupyterlab_db_explorer.engine'):
        engine._getSQL_engine('ora', db)
    text = caplog.text
    assert "SSL mode 'require' is not supported for Oracle" in text
    assert 'connect timeout is not supported for Oracle' in text
    assert 'dsn=(DESCRIPTION=...)' in text


def test_oracle_ssl_disable_does_not_warn(caplog):
    db = {
        'db_type': engine.DB_ORACLE,
        'db_host': 'ora.corp',
        'db_user': 'u',
        'db_pass': 'p',
        'db_name': 'svc',
        'db_ssl_mode': 'disable',
    }
    with patch.object(engine.sqlalchemy, 'create_engine'), \
         caplog.at_level(logging.WARNING, logger='jupyterlab_db_explorer.engine'):
        engine._getSQL_engine('ora', db)
    assert 'SSL mode' not in caplog.text


def test_kerberos_hive_warns_for_ssl_and_timeout(caplog):
    db = {
        'db_type': engine.DB_HIVE_KERBEROS,
        'db_host': 'hive.corp',
        'principal': 'svc@REALM',
        'db_ssl_mode': 'verify-full',
        'db_conn_timeout': '9',
    }
    with patch.object(engine.sqlalchemy, 'create_engine'), \
         patch('os.system'), \
         caplog.at_level(logging.WARNING, logger='jupyterlab_db_explorer.engine'):
        engine._getSQL_engine('krb', db)
    assert 'not supported for Kerberos Hive' in caplog.text
    assert 'connect timeout is not supported for Kerberos Hive' in caplog.text


def test_plain_hive_warns_for_timeout_only(caplog):
    db = _hive_db(db_conn_timeout='4')
    with patch.object(engine.sqlalchemy, 'create_engine'), \
         caplog.at_level(logging.WARNING, logger='jupyterlab_db_explorer.engine'):
        engine._getSQL_engine('hv', db)
    assert 'connect timeout is not supported for Hive without TLS' in caplog.text
    # No SSL-mode warning fired (the hint text mentioning "SSL mode" is fine).
    assert 'is not supported for' not in caplog.text.split('connect timeout')[0]
