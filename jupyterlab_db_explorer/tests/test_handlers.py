import json
import os
from unittest.mock import patch
from .. import engine


async def test_conn(jp_fetch):
    '''
    test for create/get/reset single connection
    '''
    # Initially no connection configured
    response = await jp_fetch("jupyterlab-db-explorer", "conns")
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': None}

    # Create a SQLite connection
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "test_sqlite",
            "db_name": "/tmp/unit_test.db",
            "db_type": '6'
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    # Password should be stripped
    assert payload['data']['db_type'] == '6'
    assert payload['data']['db_name'] == '/tmp/unit_test.db'
    assert payload['data']['db_id'] == 'test_sqlite'

    # GET should return the saved connection
    response = await jp_fetch("jupyterlab-db-explorer", "conns")
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload['data']['db_id'] == 'test_sqlite'

    # Get schema/tables for the SQLite connection
    response = await jp_fetch("jupyterlab-db-explorer", "dbtables")
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': []}

    # Reset the connection
    response = await jp_fetch("jupyterlab-db-explorer", "reset", method='POST',
        body=json.dumps({}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': 'ok'}

    # After reset, no connection
    response = await jp_fetch("jupyterlab-db-explorer", "conns")
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': None}


async def test_reset_allowed(jp_fetch):
    '''
    test reset allowed endpoint
    '''
    response = await jp_fetch("jupyterlab-db-explorer", "reset")
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload['data']['allow_reset'] is True


async def test_err_conn(jp_fetch):
    '''
    test for validation errors on connection creation
    '''
    # Missing db_type
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add"}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set db type.'}

    # MySQL with invalid db_name (contains path chars)
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "add",
            "db_name": "/tmp/test.db",
            "db_type": engine.DB_MYSQL
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'db name can only contain letters, numbers, and underscores.'}

    # MySQL without host
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "add",
            "db_type": engine.DB_MYSQL
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set ip addr.'}

    # Valid MySQL connection
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "add",
            "db_host": "192.168.1.100",
            "db_type": engine.DB_MYSQL
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    assert 'error' not in payload

    # Reset for next test
    await jp_fetch("jupyterlab-db-explorer", "reset", method='POST',
        body=json.dumps({}))

    # Postgres without db_name
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "add1",
            "db_type": engine.DB_PGSQL
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'postgres must set database name to connect'}

    # Postgres without host
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({
            "db_id": "add1",
            "db_name": "test",
            "db_type": engine.DB_PGSQL
        }))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set ip addr.'}


@patch("jupyterlab_db_explorer.handlers.engine.get_connection")
async def test_passwd(mock_conn, jp_fetch):
    # Connection exists but missing db_type
    mock_conn.return_value = {'db_id': 'needpass', 'db_user': 'testuser'}
    response = await jp_fetch("jupyterlab-db-explorer", "columns",
        params={'db': 'mysql', 'tbl': 'columns_priv'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
        'error': "can't get table columns of columns_priv, reason: no connection configured"
    }

    # Connection needs password
    mock_conn.return_value = {
        'db_id': 'needpass',
        'db_type': engine.DB_MYSQL,
        'db_user': 'testuser'
    }
    response = await jp_fetch("jupyterlab-db-explorer", "columns",
        params={'db': 'mysql', 'tbl': 'columns_priv'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
        'error': 'NEED-PASS',
        'pass_info': {'db_id': 'needpass', 'db_user': 'testuser'}
    }

    # Clear password
    response = await jp_fetch("jupyterlab-db-explorer", "pass", method='DELETE')
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': 'delete pass ok'}
