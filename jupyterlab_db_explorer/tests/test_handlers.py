import json
from unittest.mock import patch
from .. import engine

async def test_conn(jp_fetch):
    '''
    test for create/del connection for database
    '''
    response = await jp_fetch("jupyterlab-db-explorer", "conns")
    assert response.code == 200
    old = json.loads(response.body)

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add", "db_name":"/tmp/unit_test.db", "db_type":'6'}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
        "data": old['data'] + [{'name': 'add', 'desc': '', 'type': 'conn', 'subtype': 6, 'has_db': True}]
    }

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add2", "db_name":":memory:", "db_type":'6'}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
        "data": old['data'] + [
            {'name': 'add', 'desc': '', 'type': 'conn', 'subtype': 6, 'has_db': True},
            {'name': 'add2', 'desc': '', 'type': 'conn', 'subtype': 6, 'has_db': True}
        ]
    }

    response = await jp_fetch("jupyterlab-db-explorer", "dbtables", params={'dbid': 'add'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': []}

    response = await jp_fetch("jupyterlab-db-explorer", "conns", method='DELETE', params={'dbid': 'add'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {"data": old['data'] + [{'name': 'add2', 'desc': '', 'type': 'conn', 'subtype': 6, 'has_db': True}]}

async def test_has_db_flag(jp_fetch):
    '''`has_db` reflects whether the connection pins a default database.'''
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "nodefault", "db_host": "192.168.1.100", "db_type": engine.DB_PGSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    entry = next(c for c in payload['data'] if c['name'] == 'nodefault')
    assert entry['has_db'] is False

    response = await jp_fetch("jupyterlab-db-explorer", "conns", method='DELETE', params={'dbid': 'nodefault'})
    assert response.code == 200

async def test_query_db_passthrough(jp_fetch):
    '''POST /query forwards the optional `db` to the query task (usedb).'''
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "qpass", "db_name": ":memory:", "db_type": '6'}))
    assert response.code == 200

    try:
        with patch("jupyterlab_db_explorer.handlers.task.create_query_task") as mock_task:
            async def fake_task(dbid, sql, usedb=None):
                return 'tid-1'
            mock_task.side_effect = fake_task
            response = await jp_fetch("jupyterlab-db-explorer", "query",
                method='POST', body=json.dumps({"dbid": "qpass", "sql": "SELECT 1", "db": "otherdb"}))
            assert response.code == 200
            payload = json.loads(response.body)
            assert payload == {'error': 'RETRY', 'data': 'tid-1'}
            mock_task.assert_called_once_with('qpass', 'SELECT 1', 'otherdb')

            # Without `db` the task runs against the connection default.
            mock_task.reset_mock()
            response = await jp_fetch("jupyterlab-db-explorer", "query",
                method='POST', body=json.dumps({"dbid": "qpass", "sql": "SELECT 1"}))
            assert response.code == 200
            mock_task.assert_called_once_with('qpass', 'SELECT 1', None)
    finally:
        await jp_fetch("jupyterlab-db-explorer", "conns", method='DELETE', params={'dbid': 'qpass'})

async def test_err_conn(jp_fetch):
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add"}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set db type.'}

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add", "db_name":"/tmp/test.db", "db_type": engine.DB_MYSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'db name can only contain letters, numbers, and underscores.'}

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add", "db_host":"192.168.1.100", "db_type": engine.DB_MYSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert 'error' not in payload

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add", "db_host":"192.168.1.100", "db_type": engine.DB_MYSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'db_id add already exists.'}

    # PostgreSQL no longer requires db_name at create time — the engine
    # defaults to the `postgres` maintenance DB when none is configured.
    # A PG conn without a host still errors though.
    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add1", "db_type": engine.DB_PGSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set ip addr.'}

    response = await jp_fetch("jupyterlab-db-explorer", "conns",
        method='POST', body=json.dumps({"db_id": "add1", "db_name": "test", "db_type": engine.DB_PGSQL}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'must set ip addr.'}

async def test_testconn(jp_fetch):
    '''test the test connection endpoint'''
    response = await jp_fetch("jupyterlab-db-explorer", "testconn",
        method='POST', body=json.dumps({"db_id": "test", "db_name":":memory:", "db_type":'6'}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': 'connection successful'}

    response = await jp_fetch("jupyterlab-db-explorer", "testconn",
        method='POST', body=json.dumps({"db_id": "test", "db_host":"invalid", "db_type": engine.DB_MYSQL,
                                         "db_user": "u", "db_pass": "p"}))
    assert response.code == 200
    payload = json.loads(response.body)
    assert 'error' in payload

@patch("jupyterlab_db_explorer.handlers.engine._getDbInfo")
async def test_passwd(mock_engine, jp_fetch):
    mock_engine.return_value={'db_id': 'needpass', 'db_user': 'testuser'}
    response = await jp_fetch("jupyterlab-db-explorer", "columns", params={'dbid': 'needpass', 'db': 'mysql', 'tbl': 'columns_priv'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': "can't get table columns of columns_priv, reason: conn not exists or error"}

    mock_engine.return_value={'db_id': 'needpass', 'db_type': engine.DB_MYSQL, 'db_user': 'testuser'}
    response = await jp_fetch("jupyterlab-db-explorer", "columns", params={'dbid': 'needpass', 'db': 'mysql', 'tbl': 'columns_priv'})
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'error': 'NEED-PASS', 'pass_info': {'db_id': 'needpass', 'db_user': 'testuser'}}

    response = await jp_fetch("jupyterlab-db-explorer", "pass", method='DELETE')
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {'data': 'delete pass ok'}
