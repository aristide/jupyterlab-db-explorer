import sqlparse
from . import engine
from .serializer import make_row_serializable

log=None
def set_log(_log):
    global log
    log = _log

def query(dbid, sql, **kwargs) ->list:
    '''
    make a query.
    '''
    usedb=None
    if 'db' in kwargs:
        usedb=kwargs['db']
    eng = engine.getEngine(dbid, usedb)
    if eng:
        conn = eng.connect()
        result = conn.exec_driver_sql(sql)
        data = result.fetchall()
        conn.close()
        return data

    return []

def set_limit(sql: str, def_lim: int = 200, max_lim: int = 10000) -> (bool, str):
    '''
    Append LIMIT to a select sql statment.
    If the LIMIT is not set, set the LIMIT to def_lim. If the LIMIT is set and LIMIT < max_limit, keep it unchanged.
    Otherwise, modify the LIMIT to max_limit.
    '''
    parsed = sqlparse.parse(sql)
    if len(parsed)!=1:
        return False, 'can only process one statement'

    stmt = parsed[0]
    if not isinstance(stmt, sqlparse.sql.Statement) or stmt.get_type() != "SELECT":
        return True, sql

    out=''
    has_limit=False
    after_limit=False
    for token in stmt:
        if has_limit is False:
            if token.ttype == sqlparse.tokens.Keyword and token.value.upper() == "LIMIT":
                has_limit = True  # limit found
            else:
                out += str(token)
        elif after_limit:
            out += str(token)
        else:
            if token.ttype == sqlparse.tokens.Literal.Number.Integer:
                limit_value = int(token.value)
                after_limit = True
            elif token.ttype != sqlparse.tokens.Whitespace:
                raise Exception("Sql Error")

    use_lim = def_lim
    if has_limit:
        if limit_value<=max_lim:
            use_lim = limit_value
        else:
            use_lim = max_lim
    out += f' LIMIT {use_lim}'
    return True, out

def query_exec(dbid, sql, **kwargs) ->dict:
    '''
    make a query, return with header
    '''
    rc, sql = set_limit(sql, 10000)
    if not rc:
        raise Exception(sql)

    usedb=None
    if 'db' in kwargs:
        usedb=kwargs['db']
    eng = engine.getEngine(dbid, usedb)
    if eng:
        conn = eng.connect()
        transaction=conn.begin()
        result = conn.exec_driver_sql(sql)
        transaction.commit()
        conn.close()
        if result.returns_rows:
            data = [make_row_serializable(row) for row in result]
            columns = list(result.keys())
            return {'columns': columns, 'data': data}
    return {}

def get_column_info(dbid, db, tbl):
    '''
    '''
    dbinfo = engine._getDbInfo(dbid)
    if dbinfo is None:
        return

    columns=[]
    eng=engine.getEngine(dbid, db)
    if eng:
        if dbinfo['db_type'] ==engine.DB_SQLITE:
            for r in query(dbid, f"PRAGMA table_info('{tbl}')"):
                columns.append({'name': r[1], 'desc': r[2], 'type': 'col'})
        elif dbinfo['db_type'] in [engine.DB_MYSQL, engine.DB_STARROCKS]:
            for r in query(dbid, f"SELECT column_name, column_comment FROM information_schema.columns WHERE table_name = '{tbl}' AND table_schema = '{db}'"):
                columns.append({'name': r[0], 'desc': r[1], 'type': 'col'})
        elif dbinfo['db_type'] ==engine.DB_PGSQL:
            # When the connection has no default database, `db` is the picked
            # database (the tree listed databases and drilled into its public
            # schema). information_schema is per-database in PostgreSQL, so
            # the query must run connected to that database.
            no_default_db = not dbinfo.get('db_name')
            schema_name = 'public' if no_default_db else db
            usedb = db if no_default_db else None
            for r in query(dbid, '''
                SELECT column_name, data_type, description as comment, table_name
                FROM information_schema.columns
                LEFT JOIN pg_catalog.pg_description
                    ON (pg_description.objoid = (table_schema || '.' || table_name)::regclass
                          AND pg_description.objsubid = ordinal_position)
                WHERE table_schema = '%s' and table_name='%s'
                ORDER BY ordinal_position
            ''' %(schema_name, tbl), db=usedb):
                columns.append({'name': r[0], 'desc': r[2], 'type': 'col'})
        elif dbinfo['db_type'] ==engine.DB_ORACLE:
            for r in query(dbid, f"SELECT column_name, comments FROM all_col_comments WHERE table_name = '${tbl}'"):
                print(r)
                columns.append({'name': r[0], 'desc': '', 'type': 'col'})
        elif dbinfo['db_type'] ==engine.DB_HIVE_LDAP or dbinfo['db_type'] ==engine.DB_HIVE_KERBEROS:
            cols={}
            pk=False
            for r in query(dbid, f"DESCRIBE {tbl}", db=db):
                if r['col_name']=='':
                    continue
                if r['col_name'][0]=='#':
                    if r['col_name']=='# Partition Information':
                        pk=True
                    continue
                if pk is False:
                    cols[r['col_name']]={'name': r['col_name'], 'desc': r['comment'], 'type': 'col'}
                else:
                    cols[r['col_name']]={'name': r['col_name'], 'desc': r['comment'], 'type': 'col', 'stype': 'parkey'}
            columns=list(cols.values())
        elif dbinfo['db_type'] ==engine.DB_TRINO:
            # Flat-name path: `db` is `catalog.schema` when the connection has
            # no default catalog. Qualify the metadata query against the
            # catalog's own information_schema.
            if not dbinfo.get('db_name') and '.' in db:
                catalog, sch = db.split('.', 1)
                col_query = (
                    f'SELECT column_name, data_type FROM "{catalog}".information_schema.columns '
                    f"WHERE table_schema = '{sch}' AND table_name = '{tbl}' "
                    "ORDER BY ordinal_position"
                )
            else:
                col_query = (
                    f"SELECT column_name, data_type FROM information_schema.columns "
                    f"WHERE table_schema = '{db}' AND table_name = '{tbl}' "
                    "ORDER BY ordinal_position"
                )
            for r in query(dbid, col_query):
                columns.append({'name': r[0], 'desc': r[1], 'type': 'col'})
        elif dbinfo['db_type'] ==engine.DB_STARROCKS:
            for r in query(dbid, f"SELECT column_name, column_comment FROM information_schema.columns WHERE table_name = '{tbl}' AND table_schema = '{db}'"):
                columns.append({'name': r[0], 'desc': r[1], 'type': 'col'})
        elif dbinfo['db_type'] == engine.DB_SQLSERVER:
            # When the connection has a default database, `db` is the schema
            # name. When it doesn't, `db` is the picked database and the
            # columns of its dbo tables live in *its* information_schema —
            # the query must reconnect to it (each database has its own).
            no_default_db = not dbinfo.get('db_name')
            schema_name = 'dbo' if no_default_db else db
            usedb = db if no_default_db else None
            col_query = (
                "SELECT column_name, data_type FROM information_schema.columns "
                f"WHERE table_schema = '{schema_name}' AND table_name = '{tbl}' "
                "ORDER BY ordinal_position"
            )
            for r in query(dbid, col_query, db=usedb):
                columns.append({'name': r[0], 'desc': r[1], 'type': 'col'})
    return columns

def get_schema_or_table(dbid, schema):
    '''
    Obtain the schema or table (if there is no schema layer) of a specified database
    connection
    '''
    dbinfo = engine._getDbInfo(dbid)
    if dbinfo is None:
        return None

    if dbinfo['db_type'] ==engine.DB_SQLITE:
        tables=[]
        for r in query(dbid, '''
            SELECT
                name,
                CASE type
                    WHEN 'view' THEN 'V'
                    ELSE 'T'
                END
            FROM sqlite_master where type='table' or type='view'
        '''):
            tables.append({'name': r[0], 'desc': '', 'type': 'table', 'subtype': r[1]})
        return tables
    elif dbinfo['db_type'] ==engine.DB_PGSQL:
        # When `db_name` is empty in the saved connection, the engine connects
        # to the `postgres` maintenance DB. Top-level then lists every database
        # the user can CONNECT to, and clicking one reconnects (via `usedb`)
        # and lists tables of its `public` schema.
        no_default_db = not dbinfo.get('db_name')
        if schema is None:
            schemas=[]
            if no_default_db:
                for r in query(dbid, "SELECT datname FROM pg_database WHERE NOT datistemplate AND has_database_privilege(current_user, datname, 'CONNECT') ORDER BY datname"):
                    schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            else:
                for r in query(dbid, "select schema_name from information_schema.schemata where schema_name='public' or schema_owner!='gpadmin'"):
                    schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            return schemas
        else:
            tables=[]
            if no_default_db:
                # `schema` is the chosen database name; reconnect to it and
                # list tables of its `public` schema.
                tbl_query = '''
                SELECT
                    t.table_name,
                    CASE t.table_type
                        WHEN 'BASE TABLE' THEN 'T'
                        ELSE 'V'
                    END,
                    obj_description((t.table_schema || '.' || t.table_name)::regclass, 'pg_class') as comment
                FROM information_schema.tables t
                WHERE t.table_schema='public'
                '''
                for r in query(dbid, tbl_query, db=schema):
                    tables.append({'name': r[0], 'desc': r[2], 'type': 'table', 'subtype': r[1]})
            else:
                for r in query(dbid, '''
                SELECT
                    t.table_name,
                    CASE t.table_type
                        WHEN 'BASE TABLE' THEN 'T'
                        ELSE 'V'
                    END,
                    obj_description((t.table_schema || '.' || t.table_name)::regclass, 'pg_class') as comment
                FROM information_schema.tables t
                WHERE t.table_schema='%s'
                ''' % schema):
                    tables.append({'name': r[0], 'desc': r[2], 'type': 'table', 'subtype': r[1]})
            return tables

    elif dbinfo['db_type'] in [engine.DB_MYSQL, engine.DB_STARROCKS]:
        if schema is None:
            schemas=[]
            for r in query(dbid, "show databases"):
                schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            return schemas
        else:
            tables=[]
            for r in query(dbid, '''
                SELECT
                    table_name,
                    table_comment,
                    CASE table_type
                        WHEN 'VIEW' THEN 'V'
                        ELSE 'T'
                    END
                FROM information_schema.tables
                WHERE table_schema = '%s'
            ''' % schema):
                tables.append({'name': r[0], 'desc': r[1], 'type': 'table', 'subtype': r[2]})
            return tables

    elif dbinfo['db_type'] ==engine.DB_TRINO:
        # When no catalog is configured, top-level returns flat
        # `catalog.schema` entries spanning every catalog the user can list.
        # Drill-down then runs catalog-qualified `SHOW TABLES`.
        no_catalog = not dbinfo.get('db_name')
        if schema is None:
            schemas=[]
            if no_catalog:
                catalogs = [r[0] for r in query(dbid, "SHOW CATALOGS")]
                for catalog in catalogs:
                    try:
                        for r in query(dbid, f'SHOW SCHEMAS FROM "{catalog}"'):
                            sch = r[0]
                            if catalog == 'system' and sch in ('information_schema', 'metadata'):
                                continue
                            schemas.append({'name': f'{catalog}.{sch}', 'desc': '', 'type': 'db'})
                    except Exception:
                        # A catalog the connector can't reach (auth/config) shouldn't break browse
                        continue
            else:
                for r in query(dbid, "SHOW SCHEMAS"):
                    schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            return schemas
        else:
            tables=[]
            if no_catalog and '.' in schema:
                catalog, sch = schema.split('.', 1)
                tbl_query = f'SHOW TABLES FROM "{catalog}"."{sch}"'
            else:
                tbl_query = f"SHOW TABLES FROM {schema}"
            for r in query(dbid, tbl_query):
                tables.append({'name': r[0], 'desc': '', 'type': 'table', 'subtype': 'T'})
            return tables

    elif dbinfo['db_type'] == engine.DB_SQLSERVER:
        # Mirrors the PG flow: when no default DB is configured the engine
        # connects to `master`; top-level then lists every database the user
        # can see. Clicking a database reconnects via `usedb` and lists tables
        # of its dbo schema. When a default DB is set, top-level lists user
        # schemas of that database.
        no_default_db = not dbinfo.get('db_name')
        if schema is None:
            schemas = []
            if no_default_db:
                # database_id > 4 skips master, tempdb, model, msdb (system DBs).
                for r in query(dbid, "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"):
                    schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            else:
                for r in query(dbid, "SELECT name FROM sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest','db_owner','db_accessadmin','db_securityadmin','db_ddladmin','db_backupoperator','db_datareader','db_datawriter','db_denydatareader','db_denydatawriter') ORDER BY name"):
                    schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            return schemas
        else:
            tables = []
            tbl_query_template = (
                "SELECT table_name, "
                "CASE table_type WHEN 'VIEW' THEN 'V' ELSE 'T' END AS subtype "
                "FROM information_schema.tables "
                "WHERE table_schema = '%s' ORDER BY table_name"
            )
            if no_default_db:
                # `schema` is the chosen database; list tables of dbo.
                for r in query(dbid, tbl_query_template % 'dbo', db=schema):
                    tables.append({'name': r[0], 'desc': '', 'type': 'table', 'subtype': r[1]})
            else:
                for r in query(dbid, tbl_query_template % schema):
                    tables.append({'name': r[0], 'desc': '', 'type': 'table', 'subtype': r[1]})
            return tables

    else:
        if schema is None:
            schemas=[]
            for r in query(dbid, "show databases"):
                schemas.append({'name': r[0], 'desc': '', 'type': 'db'})
            return schemas
        else:
            tables=[]
            for r in query(dbid, "show tables", db=schema):
                tables.append({'name': r[0], 'desc': '', 'type': 'table'})
            return tables
