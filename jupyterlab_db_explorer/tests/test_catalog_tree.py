"""Tests for the catalog-level tree browsing added to db.py's
get_schema_or_table / get_column_info, for the four engines with a real
catalog/multi-database concept: Trino, StarRocks, PostgreSQL, SQL Server.

Mirrors the mocking style already used in test_trino_ssl.py: fake the
driver-level pieces rather than hitting a live server. Here that means
patching `db.query` directly and asserting on the SQL text/`db` kwarg it's
called with plus the canned rows it returns — this tests the branching and
qualifier-parsing logic in isolation, independent of whether a given
driver package (e.g. pyodbc for SQL Server) happens to be installed.
"""
from unittest.mock import MagicMock, patch

from .. import db, engine


def _dbinfo(db_type, db_name=''):
    return {'db_id': 'testdb', 'db_type': db_type, 'db_name': db_name,
            'db_user': 'u', 'db_pass': 'p'}


class FakeQuery:
    """Records calls and returns canned rows keyed by a substring match
    against the SQL text (first match wins) — good enough here, since each
    call in these tests issues one distinctive statement."""

    def __init__(self, rules):
        self.rules = rules  # list of (substring, rows)
        self.calls = []

    def __call__(self, dbid, sql, **kwargs):
        self.calls.append((sql, kwargs.get('db')))
        for substring, rows in self.rules:
            if substring in sql:
                return rows
        raise AssertionError(
            f'unexpected SQL: {sql!r} (db kwarg={kwargs.get("db")!r})'
        )


# ---------------------------------------------------------------------------
# Trino
# ---------------------------------------------------------------------------

@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_no_default_catalog_lists_catalogs_at_top(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO)
    fake = FakeQuery([('SHOW CATALOGS', [('hive',), ('system',), ('tpch',)])])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [
        {'name': 'hive', 'desc': '', 'type': 'catalog'},
        {'name': 'system', 'desc': '', 'type': 'catalog'},
        {'name': 'tpch', 'desc': '', 'type': 'catalog'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_bare_catalog_name_lists_its_schemas(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO)
    fake = FakeQuery([
        ('SHOW SCHEMAS FROM "hive"', [('default',), ('logs',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'hive')
    assert result == [
        {'name': 'default', 'desc': '', 'type': 'db'},
        {'name': 'logs', 'desc': '', 'type': 'db'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_system_catalog_filters_information_schema(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO)
    fake = FakeQuery([
        ('SHOW SCHEMAS FROM "system"', [
            ('information_schema',), ('metadata',), ('runtime',), ('jdbc',)
        ]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'system')
    assert result == [
        {'name': 'runtime', 'desc': '', 'type': 'db'},
        {'name': 'jdbc', 'desc': '', 'type': 'db'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_dotted_qualifier_lists_tables(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO)
    fake = FakeQuery([
        ('SHOW TABLES FROM "hive"."default"', [('events',), ('users',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'hive.default')
    assert result == [
        {'name': 'events', 'desc': '', 'type': 'table', 'subtype': 'T'},
        {'name': 'users', 'desc': '', 'type': 'table', 'subtype': 'T'},
    ]


@patch('jupyterlab_db_explorer.db.engine.getEngine')
@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_column_info_qualifies_against_catalog_information_schema(
    mock_dbinfo, mock_getengine
):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO)
    mock_getengine.return_value = MagicMock()
    fake = FakeQuery([
        ('FROM "hive".information_schema.columns',
         [('id', 'bigint'), ('ts', 'timestamp')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_column_info('testdb', 'hive.default', 'events')
    assert result == [
        {'name': 'id', 'desc': 'bigint', 'type': 'col'},
        {'name': 'ts', 'desc': 'timestamp', 'type': 'col'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_trino_with_default_catalog_is_unchanged(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_TRINO, db_name='hive')
    fake = FakeQuery([('SHOW SCHEMAS', [('default',)])])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [{'name': 'default', 'desc': '', 'type': 'db'}]


# ---------------------------------------------------------------------------
# StarRocks
# ---------------------------------------------------------------------------

@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_starrocks_no_default_catalog_lists_catalogs_at_top(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_STARROCKS)
    fake = FakeQuery([
        ('SHOW CATALOGS', [('default_catalog',), ('iceberg',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [
        {'name': 'default_catalog', 'desc': '', 'type': 'catalog'},
        {'name': 'iceberg', 'desc': '', 'type': 'catalog'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_starrocks_bare_catalog_name_lists_its_databases(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_STARROCKS)
    fake = FakeQuery([
        ('SHOW DATABASES FROM `iceberg`', [('appdb',), ('logs',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'iceberg')
    assert result == [
        {'name': 'appdb', 'desc': '', 'type': 'db'},
        {'name': 'logs', 'desc': '', 'type': 'db'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_starrocks_dotted_qualifier_lists_tables(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_STARROCKS)
    fake = FakeQuery([
        ('SHOW TABLES FROM `iceberg`.`appdb`', [('users',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'iceberg.appdb')
    assert result == [
        {'name': 'users', 'desc': '', 'type': 'table', 'subtype': 'T'},
    ]


@patch('jupyterlab_db_explorer.db.engine.getEngine')
@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_starrocks_column_info_uses_describe_for_catalog_qualified_table(
    mock_dbinfo, mock_getengine
):
    mock_dbinfo.return_value = _dbinfo(engine.DB_STARROCKS)
    mock_getengine.return_value = MagicMock()
    fake = FakeQuery([
        ('DESCRIBE `iceberg`.`appdb`.`users`',
         [('id', 'bigint', 'YES', '', None, ''),
          ('name', 'varchar(255)', 'YES', '', None, '')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_column_info('testdb', 'iceberg.appdb', 'users')
    assert result == [
        {'name': 'id', 'desc': 'bigint', 'type': 'col'},
        {'name': 'name', 'desc': 'varchar(255)', 'type': 'col'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_starrocks_with_default_database_behaves_like_mysql(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_STARROCKS, db_name='testdb')
    fake = FakeQuery([('show databases', [('testdb',)])])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [{'name': 'testdb', 'desc': '', 'type': 'db'}]


# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------

@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_postgres_no_default_db_lists_databases_at_top(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_PGSQL)
    fake = FakeQuery([
        ('FROM pg_database', [('appdb',), ('analytics',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [
        {'name': 'appdb', 'desc': '', 'type': 'catalog'},
        {'name': 'analytics', 'desc': '', 'type': 'catalog'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_postgres_bare_database_name_reconnects_and_lists_its_schemas(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_PGSQL)
    fake = FakeQuery([
        ('information_schema.schemata', [('public',), ('reporting',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'appdb')
    assert result == [
        {'name': 'public', 'desc': '', 'type': 'db'},
        {'name': 'reporting', 'desc': '', 'type': 'db'},
    ]
    # Reconnected to the picked database rather than querying the
    # maintenance session.
    assert fake.calls[0][1] == 'appdb'


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_postgres_dotted_qualifier_reconnects_and_lists_real_schema_tables(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_PGSQL)
    fake = FakeQuery([
        ("table_schema='reporting'", [('daily', 'T', 'daily rollup')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'appdb.reporting')
    assert result == [
        {'name': 'daily', 'desc': 'daily rollup', 'type': 'table', 'subtype': 'T'},
    ]
    assert fake.calls[0][1] == 'appdb'


@patch('jupyterlab_db_explorer.db.engine.getEngine')
@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_postgres_column_info_reconnects_for_dotted_qualifier(
    mock_dbinfo, mock_getengine
):
    mock_dbinfo.return_value = _dbinfo(engine.DB_PGSQL)
    mock_getengine.return_value = MagicMock()
    fake = FakeQuery([
        ("table_schema = 'reporting' and table_name='daily'",
         [('id', 'integer', None, 'daily')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_column_info('testdb', 'appdb.reporting', 'daily')
    assert result == [{'name': 'id', 'desc': None, 'type': 'col'}]
    assert fake.calls[0][1] == 'appdb'


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_postgres_with_default_db_is_unchanged(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_PGSQL, db_name='appdb')
    fake = FakeQuery([
        ('information_schema.schemata', [('public',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [{'name': 'public', 'desc': '', 'type': 'db'}]
    # No reconnect — uses the connection's own default database.
    assert fake.calls[0][1] is None


# ---------------------------------------------------------------------------
# SQL Server
# ---------------------------------------------------------------------------

@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_sqlserver_no_default_db_lists_databases_at_top(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_SQLSERVER)
    fake = FakeQuery([
        ('FROM sys.databases', [('salesdb',), ('analytics',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [
        {'name': 'salesdb', 'desc': '', 'type': 'catalog'},
        {'name': 'analytics', 'desc': '', 'type': 'catalog'},
    ]


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_sqlserver_bare_database_name_reconnects_and_lists_its_schemas(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_SQLSERVER)
    fake = FakeQuery([
        ('FROM sys.schemas', [('dbo',), ('sales',)]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'salesdb')
    assert result == [
        {'name': 'dbo', 'desc': '', 'type': 'db'},
        {'name': 'sales', 'desc': '', 'type': 'db'},
    ]
    assert fake.calls[0][1] == 'salesdb'


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_sqlserver_dotted_qualifier_reconnects_and_lists_real_schema_tables(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_SQLSERVER)
    fake = FakeQuery([
        ("table_schema = 'sales'", [('orders', 'T')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', 'salesdb.sales')
    assert result == [
        {'name': 'orders', 'desc': '', 'type': 'table', 'subtype': 'T'},
    ]
    assert fake.calls[0][1] == 'salesdb'


@patch('jupyterlab_db_explorer.db.engine.getEngine')
@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_sqlserver_column_info_reconnects_for_dotted_qualifier(
    mock_dbinfo, mock_getengine
):
    mock_dbinfo.return_value = _dbinfo(engine.DB_SQLSERVER)
    mock_getengine.return_value = MagicMock()
    fake = FakeQuery([
        ("table_schema = 'sales' AND table_name = 'orders'",
         [('id', 'int')]),
    ])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_column_info('testdb', 'salesdb.sales', 'orders')
    assert result == [{'name': 'id', 'desc': 'int', 'type': 'col'}]
    assert fake.calls[0][1] == 'salesdb'


@patch('jupyterlab_db_explorer.db.engine._getDbInfo')
def test_sqlserver_with_default_db_is_unchanged(mock_dbinfo):
    mock_dbinfo.return_value = _dbinfo(engine.DB_SQLSERVER, db_name='salesdb')
    fake = FakeQuery([('FROM sys.schemas', [('dbo',)])])
    with patch('jupyterlab_db_explorer.db.query', fake):
        result = db.get_schema_or_table('testdb', None)
    assert result == [{'name': 'dbo', 'desc': '', 'type': 'db'}]
    assert fake.calls[0][1] is None
