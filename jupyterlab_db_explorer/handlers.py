import asyncio
import json
import traceback
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
from . import engine, db
from . import task
from . import variables

class ConnHandler(APIHandler):
    '''
    Multi-connection handler
    '''
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({'data': engine.getDBlist()}))

    @tornado.web.authenticated
    def post(self):
        try:
            data = self.get_json_body()
            engine.addEntry(data)
            self.finish(json.dumps({'data': engine.getDBlist()}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': str(err)}))

    @tornado.web.authenticated
    def delete(self):
        dbid = self.get_argument('dbid')
        engine.delEntry(dbid)
        self.finish(json.dumps({'data': engine.getDBlist()}))

class ResetHandler(APIHandler):
    '''
    Reset all connections handler
    '''
    @tornado.web.authenticated
    def get(self):
        data = {
            'allow_reset': engine.is_reset_allowed(),
            'allowed_types': engine.get_allowed_types(),
            'vault_enabled': engine.is_vault_enabled()
        }
        self.finish(json.dumps({'data': data}))

    @tornado.web.authenticated
    def post(self):
        try:
            engine.reset_connection()
            self.finish(json.dumps({'data': 'ok'}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': str(err)}))

class TestConnHandler(APIHandler):
    '''
    Test a database connection without saving it
    '''
    @tornado.web.authenticated
    def post(self):
        try:
            data = self.get_json_body()
            ok, msg = engine.test_connection(data)
            if ok:
                self.finish(json.dumps({'data': 'connection successful'}))
            else:
                self.finish(json.dumps({'error': msg}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': str(err)}))

class DbTableHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        dbid = self.get_argument('dbid')
        database = self.get_argument('db', None)
        try:
            st, db_user = engine.check_pass(dbid)
            if not st:
                self.finish(json.dumps({'error': 'NEED-PASS', 'pass_info': {'db_id': dbid, 'db_user': db_user}}))
            else:
                data = db.get_schema_or_table(dbid, database)
                self.finish(json.dumps({'data': data}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': "can't get db/table list of " + dbid}))

class TabColumnHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        dbid = self.get_argument('dbid')
        database = self.get_argument('db', None)
        tbl = self.get_argument('tbl')
        try:
            st, db_user = engine.check_pass(dbid)
            if not st:
                self.finish(json.dumps({'error': 'NEED-PASS', 'pass_info': {'db_id': dbid, 'db_user': db_user}}))
            else:
                data = db.get_column_info(dbid, database, tbl)
                self.finish(json.dumps({'data': data}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': f"can't get table columns of {tbl}, reason: {str(err)}"}))

class PasswdHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        data = self.get_json_body()
        try:
            st, msg = engine.set_pass(data['db_id'], data['db_user'], data['db_pass'])
            if st:
                self.finish(json.dumps({'data': 'set passwd ok'}))
            else:
                self.finish(json.dumps({'error': msg}))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': "set passwd error : " + data['db_id']}))

    @tornado.web.authenticated
    def delete(self):
        dbid = self.get_argument('dbid', None)
        engine.clear_pass(dbid)
        self.finish(json.dumps({'data': 'delete pass ok'}))

class VariableHandler(APIHandler):
    '''
    User-defined SQL variables (CRUD). Values are substituted into SQL at
    query time, falling back to os.environ for names with no custom variable.
    '''
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({'data': variables.get_variables()}))

    @tornado.web.authenticated
    def post(self):
        try:
            data = self.get_json_body()
            vars_list = variables.save_variable(
                data.get('name'), data.get('value'), data.get('description', ''))
            self.finish(json.dumps({'data': vars_list}))
        except Exception as err:
            self.log.error(err)
            traceback.print_exc()
            self.finish(json.dumps({'error': str(err)}))

    @tornado.web.authenticated
    def delete(self):
        try:
            name = self.get_argument('name')
            vars_list = variables.delete_variable(name)
            self.finish(json.dumps({'data': vars_list}))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))

class QueryHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self):
        qdata = self.get_json_body()
        try:
            st, db_user = engine.check_pass(qdata['dbid'])
            if not st:
                self.finish(json.dumps({'error': 'NEED-PASS', 'pass_info': {'db_id': qdata['dbid'], 'db_user': db_user}}))
            else:
                sql = variables.resolve(qdata['sql'])
                # Optional `db`: run against this database instead of the
                # connection default (consoles opened from a picked database
                # of a no-default-db PostgreSQL/SQL Server connection).
                taskid = await task.create_query_task(
                    qdata['dbid'], sql, qdata.get('db') or None)
                self.finish(json.dumps({'error': 'RETRY', 'data': taskid}))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))

    @tornado.web.authenticated
    async def get(self):
        task_id = self.get_argument('taskid')
        try:
            rc, data = await task.get_result(task_id)
            if rc:
                self.finish(json.dumps({'data': data}))
            else:
                self.finish(json.dumps(data))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))

    @tornado.web.authenticated
    async def delete(self):
        task_id = self.get_argument('taskid')
        try:
            await task.delete(task_id)
            self.finish(json.dumps({}))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QueryPageHandler(APIHandler):
    """GET /query/page?taskid=…&offset=…&limit=…

    Returns rows in the half-open range [offset, offset+limit) from the
    cached cursor result. Cursor advances forward as needed; previously
    fetched pages are served from the in-memory page cache.
    """

    @tornado.web.authenticated
    async def get(self):
        task_id = self.get_argument('taskid')
        try:
            offset = int(self.get_argument('offset', '0'))
            limit = int(self.get_argument('limit', '1000'))
        except ValueError:
            self.finish(json.dumps({'error': 'offset and limit must be integers'}))
            return
        try:
            loop = asyncio.get_event_loop()
            rc, payload = await loop.run_in_executor(
                None, task.get_page, task_id, offset, limit
            )
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QuerySortHandler(APIHandler):
    """POST /query/sort  body={taskid, column, direction}.

    Closes the active cursor on the session, wraps the user SQL with the
    new ORDER BY, and reopens. Returns the same payload as GET /query
    so the frontend can call `setQuery` and reset its grid.
    """

    @tornado.web.authenticated
    async def post(self):
        body = self.get_json_body() or {}
        taskid = body.get('taskid')
        column = body.get('column')  # None / '' clears sort
        direction = body.get('direction', 'ASC')
        if not taskid:
            self.finish(json.dumps({'error': 'taskid required'}))
            return
        try:
            loop = asyncio.get_event_loop()
            rc, payload = await loop.run_in_executor(
                None, task.apply_sort, taskid, column, direction
            )
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QueryFilterHandler(APIHandler):
    """POST /query/filter  body={taskid, filters:[{column, op, value}, ...]}.

    Replaces the active filter set wholesale, reopens the cursor with the
    new WHERE overlay, and returns the fresh metadata + first page.
    """

    @tornado.web.authenticated
    async def post(self):
        body = self.get_json_body() or {}
        taskid = body.get('taskid')
        filters = body.get('filters', [])
        if not taskid:
            self.finish(json.dumps({'error': 'taskid required'}))
            return
        try:
            loop = asyncio.get_event_loop()
            rc, payload = await loop.run_in_executor(
                None, task.apply_filters, taskid, filters
            )
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QueryTopNHandler(APIHandler):
    """GET /query/topn?taskid=&column=&n=10.

    Independent aggregation query: 'SELECT col, COUNT(*) FROM (user_sql)
    GROUP BY col ORDER BY 2 DESC LIMIT n'. Does not disturb the active
    cursor.
    """

    @tornado.web.authenticated
    async def get(self):
        taskid = self.get_argument('taskid')
        column = self.get_argument('column')
        try:
            n = int(self.get_argument('n', '10'))
        except ValueError:
            n = 10
        try:
            loop = asyncio.get_event_loop()
            rc, payload = await loop.run_in_executor(
                None, task.top_n, taskid, column, n
            )
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QueryHistogramHandler(APIHandler):
    """GET /query/histogram?taskid=&column=&n_bins=10.

    Independent aggregation that bins values for a numeric column over the
    currently-overlayed user SQL. Does not disturb the active cursor.
    Datetime / string columns return an empty bin list.
    """

    @tornado.web.authenticated
    async def get(self):
        taskid = self.get_argument('taskid')
        column = self.get_argument('column')
        try:
            n_bins = int(self.get_argument('n_bins', '10'))
        except ValueError:
            n_bins = 10
        try:
            loop = asyncio.get_event_loop()
            rc, payload = await loop.run_in_executor(
                None, task.histogram, taskid, column, n_bins
            )
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))


class QueryStatsHandler(APIHandler):
    """GET /query/stats?taskid=…

    Returns the running per-column stats snapshot. The cursor only scrolls
    forward, so stats grow as pages are fetched.
    """

    @tornado.web.authenticated
    async def get(self):
        task_id = self.get_argument('taskid')
        try:
            rc, payload = task.get_stats(task_id)
            if rc:
                self.finish(json.dumps({'data': payload}))
            else:
                self.finish(json.dumps(payload))
        except Exception as err:
            self.log.error(err)
            self.finish(json.dumps({'error': str(err)}))

def handler_url(base_url, act):
    return url_path_join(base_url, "jupyterlab-db-explorer", act)

def setup_handlers(web_app):
    host_pattern=".*$"

    base_url=web_app.settings["base_url"]
    handlers=[
        (handler_url(base_url, "conns"), ConnHandler),
        (handler_url(base_url, "reset"), ResetHandler),
        (handler_url(base_url, "testconn"), TestConnHandler),
        (handler_url(base_url, "dbtables"), DbTableHandler),
        (handler_url(base_url, "columns"), TabColumnHandler),
        (handler_url(base_url, "pass"), PasswdHandler),
        (handler_url(base_url, "variables"), VariableHandler),
        (handler_url(base_url, "query"), QueryHandler),
        (handler_url(base_url, "query/page"), QueryPageHandler),
        (handler_url(base_url, "query/stats"), QueryStatsHandler),
        (handler_url(base_url, "query/sort"), QuerySortHandler),
        (handler_url(base_url, "query/filter"), QueryFilterHandler),
        (handler_url(base_url, "query/topn"), QueryTopNHandler),
        (handler_url(base_url, "query/histogram"), QueryHistogramHandler),
    ]
    web_app.add_handlers(host_pattern, handlers)
