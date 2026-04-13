import os
import re
import json
import base64
import sqlalchemy
import gettext
from urllib.parse import quote_plus
_ = gettext.gettext

from .const import (
    DB_ROOT,
    ENV_DB_TYPE, ENV_DB_HOST, ENV_DB_PORT,
    ENV_DB_USER, ENV_DB_PASS, ENV_DB_NAME, ENV_DB_ID,
    ENV_ALLOW_RESET, ENV_ALLOWED_TYPES
)

DB_CFG = DB_ROOT + 'db_conf.json'

DB_MYSQL = '1'
DB_PGSQL = '2'
DB_ORACLE = '3'
DB_HIVE_LDAP = '4'
DB_HIVE_KERBEROS = '5'
DB_SQLITE = '6'
DB_TRINO = '7'
DB_STARROCKS = '8'

_temp_pass_store = dict()


def open_dbfile(dbfile):
    expanded_file_path = os.path.expanduser(dbfile)
    dir_name = os.path.dirname(expanded_file_path)
    os.makedirs(dir_name, exist_ok=True)
    return open(expanded_file_path, 'wt')


# ---------------------------------------------------------------------------
# Environment variable helpers
# ---------------------------------------------------------------------------

def _getDBlist_from_env():
    """Scan environment for DB_<name> base64-encoded connection vars."""
    dbs = []
    for e in os.environ:
        if e[0:3] == 'DB_' and e not in (
            ENV_DB_TYPE, ENV_DB_HOST, ENV_DB_PORT,
            ENV_DB_USER, ENV_DB_PASS, ENV_DB_NAME, ENV_DB_ID,
            ENV_ALLOW_RESET, ENV_ALLOWED_TYPES, 'DB_EXPLORER_ALLOW_RESET',
            'DB_EXPLORER_ALLOWED_TYPES'
        ):
            dbs.append(e[3:])
    return dbs


def _getEnvDbInfo(name):
    """Get connection info from DB_<name> base64 env var."""
    var_name = 'DB_' + name
    db_str = os.getenv(var_name)
    if db_str is not None:
        return json.loads(base64.b64decode(db_str.encode()))
    return None


def load_from_env_single():
    """Read connection info from individual environment variables (DB_TYPE, etc.).
    Returns a dict if at least DB_TYPE is set, else None.
    """
    db_type = os.environ.get(ENV_DB_TYPE)
    if db_type is None:
        return None

    info = {'db_type': db_type}
    mapping = {
        'db_host': ENV_DB_HOST,
        'db_port': ENV_DB_PORT,
        'db_user': ENV_DB_USER,
        'db_pass': ENV_DB_PASS,
        'db_name': ENV_DB_NAME,
        'db_id':   ENV_DB_ID,
    }
    for key, env_name in mapping.items():
        val = os.environ.get(env_name)
        if val is not None:
            info[key] = val

    if 'db_id' not in info:
        info['db_id'] = 'default'

    return info


# ---------------------------------------------------------------------------
# Config file: multi-connection store  {dbid: {connection_info}, ...}
# ---------------------------------------------------------------------------

def _getCfgEntryList(passfile=DB_CFG):
    passfile = os.path.expanduser(passfile)
    if os.path.exists(passfile):
        with open(passfile, mode='rt') as f:
            try:
                dblst = json.load(f)
            except Exception:
                dblst = {}
    else:
        dblst = {}
    # Handle old single-connection format: if top-level has 'db_type', skip
    if isinstance(dblst, dict) and 'db_type' in dblst:
        return {}
    return dblst


def _getCfgEntry(name, passfile=DB_CFG):
    dblst = _getCfgEntryList(passfile)
    if name in dblst:
        return dblst[name]
    return None


def _saveCfgEntryList(dbcfg, dbfile=DB_CFG):
    cfg = json.dumps(dbcfg, indent=4)
    with open_dbfile(dbfile) as f:
        f.write(cfg)


# ---------------------------------------------------------------------------
# Multi-connection: list / get / add / del
# ---------------------------------------------------------------------------

def getDBlist():
    """Return list of all connections (env vars + config file).
    On first call, if env single-connection vars are set but no config entry exists,
    auto-populate the config file with them.
    """
    # Auto-populate from single env vars if config is empty
    cfg = _getCfgEntryList()
    if len(cfg) == 0:
        env_info = load_from_env_single()
        if env_info is not None:
            dbid = env_info.get('db_id', 'default')
            cfg[dbid] = env_info
            _saveCfgEntryList(cfg)

    lst = []

    # Connections from DB_<NAME> base64 env vars
    for dbid in _getDBlist_from_env():
        info = _getEnvDbInfo(dbid)
        if info:
            subtype = int(info['db_type'])
            lst.append({'name': dbid, 'desc': '', 'type': 'conn', 'subtype': subtype, 'fix': 1})

    # Connections from config file
    for dbid, e in _getCfgEntryList().items():
        lst.append({'name': dbid, 'desc': e.get('name', ''), 'type': 'conn', 'subtype': int(e['db_type'])})

    return lst


def _getDbInfo(name):
    """Get connection info by name. Checks env vars first, then config."""
    # Check DB_<name> base64 env var
    info = _getEnvDbInfo(name)
    if info is not None:
        return info
    # Check config file
    return _getCfgEntry(name)


def getDbInfo(name):
    """Public version - strips db_pass."""
    i = _getDbInfo(name)
    if i is None:
        return None
    result = dict(i)
    result.pop('db_pass', None)
    return result


def addEntry(dbinfo, dbfile=DB_CFG):
    dbid = dbinfo['db_id']
    err = ''

    if 'db_type' not in dbinfo:
        raise Exception('must set db type.')

    if dbinfo['db_type'] != DB_SQLITE:
        if 'db_host' not in dbinfo:
            err = 'must set ip addr.'

    if dbinfo['db_type'] == DB_PGSQL:
        if 'db_name' not in dbinfo:
            err = 'postgres must set database name to connect'

    if dbinfo['db_type'] == DB_SQLITE:
        if 'db_name' not in dbinfo:
            err = "sqlite must set db name (it's a database file)"
    elif 'db_name' in dbinfo:
        if not re.match(r'^[a-zA-Z0-9_]+$', dbinfo['db_name']):
            err = 'db name can only contain letters, numbers, and underscores.'

    fix_dbs = _getDBlist_from_env()
    dbcfg = _getCfgEntryList(dbfile)
    if dbid in fix_dbs or dbid in dbcfg:
        err = f'db_id {dbid} already exists.'

    if 'name' not in dbinfo:
        dbinfo['name'] = ''

    if err != '':
        raise Exception(err)

    dbcfg[dbid] = dbinfo
    _saveCfgEntryList(dbcfg, dbfile)
    return dbinfo


def delEntry(dbid, dbfile=DB_CFG):
    dbcfg = _getCfgEntryList(dbfile)
    if dbid in dbcfg:
        del dbcfg[dbid]
        _saveCfgEntryList(dbcfg, dbfile)


def reset_connection(dbfile=DB_CFG):
    """Clear all stored connections in config and temp passwords."""
    path = os.path.expanduser(dbfile)
    if os.path.exists(path):
        os.remove(path)
    clear_pass()


def is_reset_allowed():
    """Check DB_EXPLORER_ALLOW_RESET env var. Default: True."""
    val = os.environ.get(ENV_ALLOW_RESET, '1').lower()
    return val in ('1', 'true', 'yes')


# Name-to-code mapping for allowed types
_TYPE_NAME_MAP = {
    'mysql': DB_MYSQL, 'pgsql': DB_PGSQL, 'postgresql': DB_PGSQL,
    'postgres': DB_PGSQL, 'oracle': DB_ORACLE, 'hive': DB_HIVE_LDAP,
    'hive-ldap': DB_HIVE_LDAP, 'hive-kerberos': DB_HIVE_KERBEROS,
    'sqlite': DB_SQLITE, 'trino': DB_TRINO, 'starrocks': DB_STARROCKS,
}


def get_allowed_types():
    """Read DB_EXPLORER_ALLOWED_TYPES env var.
    Accepts comma-separated type codes (e.g. '2,7') or names (e.g. 'pgsql,trino').
    Returns a list of type code strings, or None if not set (all types allowed).
    """
    val = os.environ.get(ENV_ALLOWED_TYPES)
    if not val:
        return None

    codes = []
    for part in val.split(','):
        part = part.strip().lower()
        if not part:
            continue
        if part in _TYPE_NAME_MAP:
            codes.append(_TYPE_NAME_MAP[part])
        elif part.isdigit() and 1 <= int(part) <= 8:
            codes.append(part)
    return codes if codes else None


# ---------------------------------------------------------------------------
# Engine creation
# ---------------------------------------------------------------------------

def _getSQL_engine(dbid, db, usedb=None):
    db_host = db.get('db_host', '')
    db_name = db.get('db_name', '')

    if usedb is not None and db['db_type'] in [DB_MYSQL, DB_STARROCKS, DB_HIVE_LDAP, DB_HIVE_KERBEROS]:
        db_name = usedb

    if db['db_type'] == DB_HIVE_KERBEROS:
        db_port = db.get('db_port', 10000)
        principal = db['principal']
        os.system(f"kinit -kt /opt/conda/etc/keytab_{dbid} {principal}")
        sqlstr = f"hive://{db_host}:{db_port}/{db_name}"
        return sqlalchemy.create_engine(sqlstr, connect_args={'auth': 'KERBEROS', 'kerberos_service_name': 'hive'})

    # Types that can connect without any credentials at all
    _NO_AUTH_TYPES = (DB_SQLITE, DB_HIVE_KERBEROS, DB_TRINO)

    # Resolve user/pass
    db_user = None
    db_pass_encoded = None
    if db['db_type'] not in _NO_AUTH_TYPES:
        if db.get('db_user'):
            db_user = db['db_user']
            db_pass_encoded = quote_plus(db.get('db_pass', ''))
        elif dbid in _temp_pass_store:
            db_user = _temp_pass_store[dbid]['user']
            db_pass_encoded = quote_plus(_temp_pass_store[dbid]['pwd'])
        else:
            db_user_hint = db.get('db_user', None)
            input_passwd(dbid, db_user_hint)
            return
    elif db['db_type'] == DB_TRINO:
        # Trino: use credentials if provided, otherwise connect without auth
        db_user = db.get('db_user', '')
        db_pass_encoded = quote_plus(db['db_pass']) if db.get('db_pass') else ''

    if db['db_type'] == DB_MYSQL:
        db_port = db.get('db_port', 3306)
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_PGSQL:
        db_port = db.get('db_port', 5432)
        sqlstr = f"postgresql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_ORACLE:
        db_port = db.get('db_port', 1521)
        sqlstr = f"oracle+cx_Oracle://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_HIVE_LDAP:
        db_port = db.get('db_port', 10000)
        sqlstr = f"hive://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"
        return sqlalchemy.create_engine(sqlstr, connect_args={'auth': 'LDAP'})

    elif db['db_type'] == DB_SQLITE:
        if db_name == ':memory:':
            sqlstr = "sqlite+pysqlite:///:memory:"
            return sqlalchemy.create_engine(sqlstr)
        if db_name[0] != '/':
            db_name = os.path.expanduser(DB_ROOT + db_name)
        dir_name = os.path.dirname(db_name)
        if dir_name and not os.path.isdir(dir_name):
            os.makedirs(dir_name, exist_ok=True)
        sqlstr = f"sqlite+pysqlite:///{db_name}"
        return sqlalchemy.create_engine(sqlstr)

    elif db['db_type'] == DB_TRINO:
        db_port = db.get('db_port', 8080)
        if db_user:
            auth_part = f"{db_user}:{db_pass_encoded}@" if db_pass_encoded else f"{db_user}@"
            sqlstr = f"trino://{auth_part}{db_host}:{db_port}/{db_name}"
        else:
            sqlstr = f"trino://{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_STARROCKS:
        db_port = db.get('db_port', 9030)
        if db_user is None:
            # StarRocks: try temp_pass_store or prompt
            if dbid not in _temp_pass_store:
                db_user_hint = db.get('db_user', None)
                input_passwd(dbid, db_user_hint)
                return
            else:
                db_user = _temp_pass_store[dbid]['user']
                db_pass_encoded = quote_plus(_temp_pass_store[dbid]['pwd'])
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"

    else:
        raise ValueError("unsupported database type")

    return sqlalchemy.create_engine(sqlstr, pool_size=20, max_overflow=20, pool_timeout=30000, echo=False)


def __gen_krb5_conf(db):
    if db['db_type'] != DB_HIVE_KERBEROS:
        return
    default_realm = db['def_realm']
    with open('/opt/conda/etc/krb5.conf', 'a') as f:
        f.write(f"[libdefaults]\ndefault_realm = {default_realm}\ndns_lookup_realm = false\ndns_lookup_kdc = false\n\n[realms]\n")
        for realm, cfg in db['krb5conf'].items():
            f.write("  %s = {\n" % realm)
            for k, v in cfg.items():
                f.write(f"    {k} = {v}\n")
            f.write("  }\n")


def getEngine(dbid, usedb=None):
    dbinfo = _getDbInfo(dbid)

    if dbinfo is None:
        if os.environ.get('BATCH'):
            print("Can't Access DB: %s" % dbid)
            return False
        return None

    __gen_krb5_conf(dbinfo)
    return _getSQL_engine(dbid, dbinfo, usedb)


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------

def test_connection(dbinfo):
    """Test a database connection without saving it.
    Returns (True, None) on success, (False, error_message) on failure.
    """
    try:
        db = dict(dbinfo)
        dbid = db.get('db_id', 'test')

        # Types that can connect without credentials
        no_auth_types = (DB_SQLITE, DB_HIVE_KERBEROS, DB_TRINO)

        # For types that require user/pass, check they are provided
        if db.get('db_type') not in no_auth_types:
            if not db.get('db_user'):
                return False, 'username is required for test'

        eng = _getSQL_engine(dbid, db)
        if eng is None:
            return False, 'could not create engine'

        conn = eng.connect()
        conn.close()
        eng.dispose()
        return True, None
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# Password handling (per-connection)
# ---------------------------------------------------------------------------

def check_pass(dbid):
    """Check if password is available for a given connection."""
    dbinfo = _getDbInfo(dbid)
    if dbinfo is None or 'db_type' not in dbinfo:
        raise Exception('conn not exists or error')

    if dbinfo['db_type'] in (DB_HIVE_KERBEROS, DB_SQLITE, DB_TRINO):
        return (True, None)

    if 'db_user' in dbinfo and 'db_pass' in dbinfo:
        return (True, None)

    if dbid in _temp_pass_store:
        return (True, None)

    db_user = dbinfo.get('db_user', '')
    return (False, db_user)


def set_pass(dbid, user, pwd):
    _temp_pass_store[dbid] = {'user': user, 'pwd': pwd}

    eng = getEngine(dbid)
    if eng:
        try:
            conn = eng.connect()
            conn.close()
            return True, None
        except Exception:
            del _temp_pass_store[dbid]
            return False, "user or passwd error"
    else:
        del _temp_pass_store[dbid]
        return False, "user or passwd error"


def clear_pass(dbid=None):
    global _temp_pass_store
    if dbid is None or dbid == '':
        _temp_pass_store = dict()
    elif dbid in _temp_pass_store:
        del _temp_pass_store[dbid]
