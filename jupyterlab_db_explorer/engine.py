import os
import re
import json
import sqlalchemy
import gettext
from urllib.parse import quote_plus
_ = gettext.gettext

from .const import (
    DB_ROOT,
    ENV_DB_TYPE, ENV_DB_HOST, ENV_DB_PORT,
    ENV_DB_USER, ENV_DB_PASS, ENV_DB_NAME, ENV_DB_ID,
    ENV_ALLOW_RESET
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

_CONN_KEY = 'default'
_temp_pass_store = dict()


def open_dbfile(dbfile):
    expanded_file_path = os.path.expanduser(dbfile)
    dir_name = os.path.dirname(expanded_file_path)
    os.makedirs(dir_name, exist_ok=True)
    return open(expanded_file_path, 'wt')


# ---------------------------------------------------------------------------
# Single-connection config: load / save / reset
# ---------------------------------------------------------------------------

def load_from_env():
    """Read connection info from individual environment variables.
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


def load_from_config(dbfile=DB_CFG):
    """Read the single connection from the config file.
    Returns a dict or None.
    """
    path = os.path.expanduser(dbfile)
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'rt') as f:
            data = json.load(f)
    except Exception:
        return None

    if not isinstance(data, dict):
        return None

    # Detect old multi-connection format (top-level keys are connection IDs,
    # not db_type etc.)
    if 'db_type' not in data:
        return None

    return data


def save_to_config(dbinfo, dbfile=DB_CFG):
    """Write a single connection dict to the config file."""
    cfg = json.dumps(dbinfo, indent=4)
    with open_dbfile(dbfile) as f:
        f.write(cfg)


def get_connection(dbfile=DB_CFG):
    """Get the single connection info. Priority:
    1. Config file
    2. Environment variables (also persisted to config)
    Returns dict or None.
    """
    info = load_from_config(dbfile)
    if info is not None:
        return info

    info = load_from_env()
    if info is not None:
        save_to_config(info, dbfile)
        return info

    return None


def get_connection_info(dbfile=DB_CFG):
    """Public version of get_connection() that strips db_pass."""
    info = get_connection(dbfile)
    if info is None:
        return None
    result = dict(info)
    result.pop('db_pass', None)
    return result


def set_connection(dbinfo, dbfile=DB_CFG):
    """Validate and save a new connection."""
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

    if 'db_id' not in dbinfo:
        dbinfo['db_id'] = 'default'

    if 'name' not in dbinfo:
        dbinfo['name'] = ''

    if err != '':
        raise Exception(err)

    save_to_config(dbinfo, dbfile)
    return dbinfo


def reset_connection(dbfile=DB_CFG):
    """Clear the stored connection config and temp passwords."""
    path = os.path.expanduser(dbfile)
    if os.path.exists(path):
        os.remove(path)
    clear_pass()


def is_reset_allowed():
    """Check DB_EXPLORER_ALLOW_RESET env var. Default: True."""
    val = os.environ.get(ENV_ALLOW_RESET, '1').lower()
    return val in ('1', 'true', 'yes')


# ---------------------------------------------------------------------------
# Engine creation
# ---------------------------------------------------------------------------

def _getSQL_engine(db, usedb=None):
    db_host = db.get('db_host', '')
    db_name = db.get('db_name', '')

    if usedb is not None and db['db_type'] in [DB_MYSQL, DB_STARROCKS, DB_HIVE_LDAP, DB_HIVE_KERBEROS]:
        db_name = usedb

    dbid = db.get('db_id', 'default')

    if db['db_type'] == DB_HIVE_KERBEROS:
        db_port = db.get('db_port', 10000)
        principal = db['principal']
        os.system(f"kinit -kt /opt/conda/etc/keytab_{dbid} {principal}")
        sqlstr = f"hive://{db_host}:{db_port}/{db_name}"
        return sqlalchemy.create_engine(sqlstr, connect_args={'auth': 'KERBEROS', 'kerberos_service_name': 'hive'})

    # set user/pass for db (exclude SQLite)
    if db['db_type'] != DB_SQLITE:
        if 'db_user' not in db or 'db_pass' not in db:
            if _CONN_KEY not in _temp_pass_store:
                db_user = db.get('db_user', None)
                input_passwd(db_user)
                return
            else:
                db_user = _temp_pass_store[_CONN_KEY]['user']
                db_pass = _temp_pass_store[_CONN_KEY]['pwd']
        else:
            db_user = db['db_user']
            db_pass = db['db_pass']
        db_pass = quote_plus(db_pass)

    if db['db_type'] == DB_MYSQL:
        db_port = db.get('db_port', 3306)
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_PGSQL:
        db_port = db.get('db_port', 5432)
        sqlstr = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_ORACLE:
        db_port = db.get('db_port', 1521)
        sqlstr = f"oracle+cx_Oracle://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_HIVE_LDAP:
        db_port = db.get('db_port', 10000)
        sqlstr = f"hive://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
        return sqlalchemy.create_engine(sqlstr, connect_args={'auth': 'LDAP'})

    elif db['db_type'] == DB_SQLITE:
        if db_name[0] != '/' and db_name != ':memory:':
            db_name = os.path.expanduser(DB_ROOT + db_name)
        dir_name = os.path.dirname(db_name)
        if not os.path.isdir(dir_name):
            os.makedirs(dir_name, exist_ok=True)
        sqlstr = f"sqlite+pysqlite:///{db_name}"
        return sqlalchemy.create_engine(sqlstr)

    elif db['db_type'] == DB_TRINO:
        db_port = db.get('db_port', 8080)
        sqlstr = f"trino://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

    elif db['db_type'] == DB_STARROCKS:
        db_port = db.get('db_port', 9030)
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

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


def getEngine(usedb=None):
    """Get SQLAlchemy engine for the single configured connection."""
    dbinfo = get_connection()

    if dbinfo is None:
        if os.environ.get('BATCH'):
            print("Can't Access DB: no connection configured")
            return False
        return None

    __gen_krb5_conf(dbinfo)
    return _getSQL_engine(dbinfo, usedb)


# ---------------------------------------------------------------------------
# Password handling (single connection)
# ---------------------------------------------------------------------------

def check_pass():
    """Check if password is available for the single connection."""
    dbinfo = get_connection()
    if dbinfo is None or 'db_type' not in dbinfo:
        raise Exception('no connection configured')

    if dbinfo['db_type'] in (DB_HIVE_KERBEROS, DB_SQLITE):
        return (True, None)

    if 'db_user' in dbinfo and 'db_pass' in dbinfo:
        return (True, None)

    if _CONN_KEY in _temp_pass_store:
        return (True, None)

    db_user = dbinfo.get('db_user', '')
    return (False, db_user)


def set_pass(user, pwd):
    """Store temporary password and validate connection."""
    _temp_pass_store[_CONN_KEY] = {'user': user, 'pwd': pwd}

    eng = getEngine()
    if eng:
        try:
            conn = eng.connect()
            conn.close()
            return True, None
        except Exception:
            del _temp_pass_store[_CONN_KEY]
            return False, "user or passwd error"
    else:
        del _temp_pass_store[_CONN_KEY]
        return False, "user or passwd error"


def clear_pass():
    """Clear temporary stored password."""
    global _temp_pass_store
    _temp_pass_store = dict()
