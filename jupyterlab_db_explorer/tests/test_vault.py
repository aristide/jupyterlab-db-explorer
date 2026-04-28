import time
from unittest.mock import MagicMock, patch

import pytest

from .. import engine


@pytest.fixture(autouse=True)
def _reset_vault_state():
    """Reset module-level Vault state between tests."""
    engine._vault_client = None
    engine._vault_client_failed_at = 0.0
    engine.clear_vault_cache()
    yield
    engine._vault_client = None
    engine._vault_client_failed_at = 0.0
    engine.clear_vault_cache()


def _mock_client(secret_data):
    client = MagicMock()
    client.is_authenticated.return_value = True
    client.secrets.kv.v2.read_secret_version.return_value = {
        'data': {'data': secret_data}
    }
    return client


def test_passthrough_non_vault_url():
    assert engine._resolve_vault_secret('plain_password') == 'plain_password'
    assert engine._resolve_vault_secret('') == ''
    assert engine._resolve_vault_secret(None) is None


def test_missing_hash_returns_original_url():
    url = 'vault://secret/database/prod'
    # Vault should never be consulted for a malformed URL.
    with patch.object(engine, '_get_vault_client') as gc:
        assert engine._resolve_vault_secret(url) == url
        gc.assert_not_called()


def test_empty_path_or_field_returns_original_url():
    with patch.object(engine, '_get_vault_client') as gc:
        assert engine._resolve_vault_secret('vault://#field') == 'vault://#field'
        assert engine._resolve_vault_secret('vault://path#') == 'vault://path#'
        gc.assert_not_called()


def test_success_path_returns_value_and_caches():
    client = _mock_client({'password': 's3cret'})
    with patch.object(engine, '_get_vault_client', return_value=client):
        url = 'vault://db/prod#password'
        assert engine._resolve_vault_secret(url) == 's3cret'
        # Second call should hit the cache — no second read.
        assert engine._resolve_vault_secret(url) == 's3cret'
        assert client.secrets.kv.v2.read_secret_version.call_count == 1


def test_unavailable_vault_returns_original_url():
    with patch.object(engine, '_get_vault_client', return_value=None):
        url = 'vault://db/prod#password'
        # Critical: fallback must be the ORIGINAL URL, not a stripped variant,
        # so downstream errors are "bad credential" rather than a silent mismatch.
        assert engine._resolve_vault_secret(url) == url


def test_missing_field_does_not_poison_cache():
    client = _mock_client({'password': 's3cret'})
    with patch.object(engine, '_get_vault_client', return_value=client):
        url = 'vault://db/prod#username'  # field not in secret
        assert engine._resolve_vault_secret(url) == url
        # Cache should be empty so a later fix (adding the field) is picked up
        # without waiting for TTL.
        assert not engine._vault_cache


def test_read_exception_returns_original_url():
    client = MagicMock()
    client.is_authenticated.return_value = True
    client.secrets.kv.v2.read_secret_version.side_effect = RuntimeError('boom')
    with patch.object(engine, '_get_vault_client', return_value=client):
        url = 'vault://db/prod#password'
        assert engine._resolve_vault_secret(url) == url
        assert not engine._vault_cache


def test_cache_expiry_triggers_refetch():
    client = _mock_client({'password': 'v1'})
    with patch.object(engine, '_get_vault_client', return_value=client):
        url = 'vault://db/prod#password'
        assert engine._resolve_vault_secret(url) == 'v1'
        # Manually age the cache entry past TTL.
        (k, (v, _)), = engine._vault_cache.items()
        engine._vault_cache[k] = (v, time.time() - engine.VAULT_CACHE_TTL - 1)

        client.secrets.kv.v2.read_secret_version.return_value = {
            'data': {'data': {'password': 'v2'}}
        }
        assert engine._resolve_vault_secret(url) == 'v2'


def test_cache_is_bounded():
    client = MagicMock()
    client.is_authenticated.return_value = True

    def read(path, mount_point):
        return {'data': {'data': {'f': f'val-{path}'}}}

    client.secrets.kv.v2.read_secret_version.side_effect = read
    with patch.object(engine, '_get_vault_client', return_value=client), \
         patch.object(engine, 'VAULT_CACHE_MAX', 3):
        for i in range(5):
            engine._resolve_vault_secret(f'vault://path{i}#f')
        assert len(engine._vault_cache) == 3
        # Oldest entries should have been evicted.
        keys = list(engine._vault_cache.keys())
        assert keys == [('path2', 'f'), ('path3', 'f'), ('path4', 'f')]


def test_client_backoff_after_failure():
    calls = {'n': 0}

    def fake_init(*_a, **_kw):
        calls['n'] += 1
        raise RuntimeError('unreachable')

    with patch.object(engine, 'VAULT_ADDR', 'http://vault:8200'), \
         patch.object(engine, 'VAULT_TOKEN', 'tok'):
        with patch('hvac.Client', side_effect=fake_init):
            assert engine._get_vault_client() is None
            # Within the retry window, no re-attempt.
            assert engine._get_vault_client() is None
            assert calls['n'] == 1


def test_token_auth_requires_token():
    with patch.object(engine, 'VAULT_ADDR', 'http://vault:8200'), \
         patch.object(engine, 'VAULT_AUTH_METHOD', 'token'), \
         patch.object(engine, 'VAULT_TOKEN', ''):
        assert engine._get_vault_client() is None


def test_approle_auth_requires_role_and_secret():
    with patch.object(engine, 'VAULT_ADDR', 'http://vault:8200'), \
         patch.object(engine, 'VAULT_AUTH_METHOD', 'approle'), \
         patch.object(engine, 'VAULT_ROLE_ID', ''), \
         patch.object(engine, 'VAULT_SECRET_ID', ''):
        assert engine._get_vault_client() is None


def test_no_vault_addr_returns_none():
    with patch.object(engine, 'VAULT_ADDR', ''):
        assert engine._get_vault_client() is None


def test_disabled_toggle_bypasses_vault():
    # Even with address and token configured, VAULT_ENABLED=False must fully
    # short-circuit: no client, no warning, and vault:// URLs pass through.
    with patch.object(engine, 'VAULT_ENABLED', False), \
         patch.object(engine, 'VAULT_ADDR', 'http://vault:8200'), \
         patch.object(engine, 'VAULT_TOKEN', 'tok'), \
         patch('hvac.Client') as hvac_client:
        assert engine._get_vault_client() is None
        url = 'vault://db/prod#password'
        assert engine._resolve_vault_secret(url) == url
        hvac_client.assert_not_called()


def test_clear_pass_flushes_vault_cache():
    client = _mock_client({'password': 's3cret'})
    with patch.object(engine, '_get_vault_client', return_value=client):
        engine._resolve_vault_secret('vault://db/prod#password')
        assert engine._vault_cache
        engine.clear_pass()
        assert not engine._vault_cache
