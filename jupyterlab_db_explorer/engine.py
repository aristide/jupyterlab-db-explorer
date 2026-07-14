import os
import re
import json
import base64
import logging
import time
import threading
import sqlalchemy
import gettext
from collections import OrderedDict
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)
_ = gettext.gettext

from .const import (
    DB_ROOT,
    ENV_DB_TYPE, ENV_DB_HOST, ENV_DB_PORT,
    ENV_DB_USER, ENV_DB_PASS, ENV_DB_NAME, ENV_DB_ID,
    ENV_DB_AUTH_TYPE, ENV_DB_HTTP_SCHEME,
    ENV_DB_SSL_MODE, ENV_DB_CONN_TIMEOUT, ENV_DB_CONN_OPTS,
    ENV_ALLOW_RESET, ENV_ALLOWED_TYPES,
    ENV_DB_CONN_PREFIX,
    ENV_DB_CONN_SUFFIX_TYPE, ENV_DB_CONN_SUFFIX_HOST,
    ENV_DB_CONN_SUFFIX_PORT, ENV_DB_CONN_SUFFIX_USER,
    ENV_DB_CONN_SUFFIX_PASS, ENV_DB_CONN_SUFFIX_NAME,
    ENV_DB_CONN_SUFFIX_ID,
    ENV_DB_CONN_SUFFIX_AUTH_TYPE, ENV_DB_CONN_SUFFIX_HTTP_SCHEME,
    ENV_DB_CONN_SUFFIX_SSL_MODE, ENV_DB_CONN_SUFFIX_TIMEOUT,
    ENV_DB_CONN_SUFFIX_OPTS,
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
DB_SQLSERVER = '9'

_temp_pass_store = dict()

# ---------------------------------------------------------------------------
# HashiCorp Vault integration
# ---------------------------------------------------------------------------

VAULT_CACHE_TTL = 300  # secret cache TTL, seconds
VAULT_CACHE_MAX = 1024  # max entries in the secret cache
VAULT_CLIENT_RETRY_DELAY = 30  # back off this long after a client init failure

VAULT_ENABLED = os.environ.get('VAULT_ENABLED', 'true').strip().lower() not in (
    '', '0', 'false', 'no', 'off'
)
VAULT_ADDR = os.environ.get('VAULT_ADDR', '')
VAULT_TOKEN = os.environ.get('VAULT_TOKEN', '')
VAULT_AUTH_METHOD = os.environ.get('VAULT_AUTH_METHOD', 'token').lower()
VAULT_ROLE_ID = os.environ.get('VAULT_ROLE_ID', '')
VAULT_SECRET_ID = os.environ.get('VAULT_SECRET_ID', '')
VAULT_KV_MOUNT = os.environ.get('VAULT_KV_MOUNT', 'secret')

_vault_client = None
_vault_client_lock = threading.Lock()
_vault_client_failed_at = 0.0
_vault_cache = OrderedDict()  # LRU: {(path, field): (value, timestamp)}
_vault_cache_lock = threading.Lock()


def _get_vault_client():
    """Get or create the Vault client (singleton, thread-safe).

    Returns None if Vault is unconfigured or unreachable. Failures are cached
    for VAULT_CLIENT_RETRY_DELAY seconds so a dead Vault doesn't get hammered.
    """
    global _vault_client, _vault_client_failed_at

    with _vault_client_lock:
        if not VAULT_ENABLED:
            return None

        if _vault_client is not None:
            return _vault_client

        if time.time() - _vault_client_failed_at < VAULT_CLIENT_RETRY_DELAY:
            return None

        if not VAULT_ADDR:
            _vault_client_failed_at = time.time()
            return None

        try:
            import hvac
            client = hvac.Client(url=VAULT_ADDR)

            if VAULT_AUTH_METHOD == 'token':
                if not VAULT_TOKEN:
                    logger.warning("VAULT_AUTH_METHOD=token but VAULT_TOKEN is not set")
                    _vault_client_failed_at = time.time()
                    return None
                client.token = VAULT_TOKEN
            elif VAULT_AUTH_METHOD == 'approle':
                if not VAULT_ROLE_ID or not VAULT_SECRET_ID:
                    logger.warning("VAULT_AUTH_METHOD=approle requires VAULT_ROLE_ID and VAULT_SECRET_ID")
                    _vault_client_failed_at = time.time()
                    return None
                client.auth.approle.login(role_id=VAULT_ROLE_ID, secret_id=VAULT_SECRET_ID)
            else:
                logger.warning("Unsupported VAULT_AUTH_METHOD: %s", VAULT_AUTH_METHOD)
                _vault_client_failed_at = time.time()
                return None

            if not client.is_authenticated():
                logger.warning("Vault client failed to authenticate")
                _vault_client_failed_at = time.time()
                return None

            _vault_client = client
            return _vault_client
        except Exception:
            logger.warning("Vault client initialization failed", exc_info=True)
            _vault_client_failed_at = time.time()
            return None


_VAULT_MISSING = object()


def _resolve_vault_secret(url):
    """Resolve a vault:// URL to its actual value.

    Format: vault://path#field
    - path: KV v2 secret path, relative to VAULT_KV_MOUNT (default 'secret')
    - field: field name within that secret

    Returns the secret value on success, or the original URL unchanged on any
    failure (non-vault input, malformed URL, Vault unreachable, missing field).
    Returning the original URL means a DB connection failure surfaces a clear
    "auth error" rather than connecting with a silently-mangled credential.
    """
    if not isinstance(url, str) or not url.startswith('vault://'):
        return url

    spec = url[len('vault://'):]
    if '#' not in spec:
        logger.warning("Invalid vault:// URL, missing '#field': %r", url)
        return url

    path, field = spec.rsplit('#', 1)
    if not path or not field:
        logger.warning("Invalid vault:// URL, empty path or field: %r", url)
        return url

    cache_key = (path, field)
    now = time.time()

    with _vault_cache_lock:
        entry = _vault_cache.get(cache_key)
        if entry is not None:
            value, ts = entry
            if now - ts < VAULT_CACHE_TTL:
                _vault_cache.move_to_end(cache_key)
                return value

    client = _get_vault_client()
    if client is None:
        return url

    try:
        response = client.secrets.kv.v2.read_secret_version(
            path=path,
            mount_point=VAULT_KV_MOUNT,
        )
        value = response['data']['data'].get(field, _VAULT_MISSING)
        if value is _VAULT_MISSING:
            logger.warning("Vault secret at path %r has no field %r", path, field)
            return url

        with _vault_cache_lock:
            _vault_cache[cache_key] = (value, now)
            _vault_cache.move_to_end(cache_key)
            while len(_vault_cache) > VAULT_CACHE_MAX:
                _vault_cache.popitem(last=False)

        return value
    except Exception:
        logger.warning("Failed to fetch Vault secret at path %r", path, exc_info=True)
        return url


def clear_vault_cache():
    """Clear the Vault secret cache."""
    with _vault_cache_lock:
        _vault_cache.clear()


def is_vault_enabled():
    """Report whether Vault integration is enabled by the admin.

    Only reflects the VAULT_ENABLED toggle — does not probe connectivity.
    The form uses this to decide whether to offer "vault reference" as an
    auth input mode; an unreachable Vault is surfaced at connect time.
    """
    return bool(VAULT_ENABLED)


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
            ENV_DB_AUTH_TYPE, ENV_DB_HTTP_SCHEME, ENV_DB_SSL_MODE,
            ENV_ALLOW_RESET, ENV_ALLOWED_TYPES,
        ) and not e.startswith(ENV_DB_CONN_PREFIX) \
                and not e.startswith('DB_EXPLORER_'):
            dbs.append(e[3:])
    return dbs


def _getEnvDbInfo(name):
    """Get connection info from DB_<name> base64 env var."""
    var_name = 'DB_' + name
    db_str = os.getenv(var_name)
    if db_str is not None:
        return json.loads(base64.b64decode(db_str.encode()))
    return None


def _getConns_from_env():
    """Scan environment for DB_CONN_<name>_<field> human-readable multi-connection vars.
    Returns a dict: {conn_name: {db_type, db_host, ...}}
    """
    conns = {}
    prefix = ENV_DB_CONN_PREFIX
    plen = len(prefix)

    # Field suffix string -> info key mapping
    suffix_to_key = {
        ENV_DB_CONN_SUFFIX_TYPE: 'db_type',
        ENV_DB_CONN_SUFFIX_HOST: 'db_host',
        ENV_DB_CONN_SUFFIX_PORT: 'db_port',
        ENV_DB_CONN_SUFFIX_USER: 'db_user',
        ENV_DB_CONN_SUFFIX_PASS: 'db_pass',
        ENV_DB_CONN_SUFFIX_NAME: 'db_name',
        ENV_DB_CONN_SUFFIX_ID: 'db_id',
        ENV_DB_CONN_SUFFIX_AUTH_TYPE: 'db_auth_type',
        ENV_DB_CONN_SUFFIX_HTTP_SCHEME: 'db_http_scheme',
        ENV_DB_CONN_SUFFIX_SSL_MODE: 'db_ssl_mode',
        ENV_DB_CONN_SUFFIX_TIMEOUT: 'db_conn_timeout',
        ENV_DB_CONN_SUFFIX_OPTS: 'db_conn_opts',
    }
    # Longest suffix first so '_AUTH_TYPE' wins over '_TYPE' on
    # DB_CONN_PROD_AUTH_TYPE — otherwise that variable would be parsed as
    # connection 'PROD_AUTH' with field 'TYPE'.
    ordered_suffixes = sorted(suffix_to_key.keys(), key=len, reverse=True)

    for e in os.environ:
        if not e.startswith(prefix):
            continue
        rest = e[plen:]  # e.g., "PRODUCTION_TYPE"

        # Find which suffix this ends with (longest match wins)
        matched_suffix = None
        info_key = None
        for suff in ordered_suffixes:
            if rest.endswith(suff):
                matched_suffix = suff
                info_key = suffix_to_key[suff]
                break
        if matched_suffix is None:
            continue

        conn_name = rest[:-len(matched_suffix)]
        if not conn_name:
            continue

        if conn_name not in conns:
            conns[conn_name] = {}
        conns[conn_name][info_key] = os.environ[e]

    return conns


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
        'db_auth_type':   ENV_DB_AUTH_TYPE,
        'db_http_scheme': ENV_DB_HTTP_SCHEME,
        'db_ssl_mode':    ENV_DB_SSL_MODE,
        'db_conn_timeout': ENV_DB_CONN_TIMEOUT,
        'db_conn_opts':   ENV_DB_CONN_OPTS,
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

    # Connections from DB_CONN_<NAME>_<FIELD> human-readable env vars
    for dbid, info in _getConns_from_env().items():
        if 'db_type' in info:
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
    # Check DB_CONN_<NAME>_<FIELD> human-readable env vars
    conns = _getConns_from_env()
    if name in conns:
        return conns[name]
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
    'sqlserver': DB_SQLSERVER, 'mssql': DB_SQLSERVER,
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
        elif part.isdigit() and 1 <= int(part) <= 9:
            codes.append(part)
    return codes if codes else None


# ---------------------------------------------------------------------------
# Advanced connection options: SSL mode / connect timeout / extra params
# ---------------------------------------------------------------------------

_SSL_MODES = ('disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full')


def _get_ssl_mode(db):
    """Normalized db_ssl_mode, or None when unset or unrecognized."""
    mode = str(db.get('db_ssl_mode') or '').strip().lower()
    return mode if mode in _SSL_MODES else None


def _get_conn_timeout(db):
    """db_conn_timeout as a positive int (seconds), or None."""
    raw = str(db.get('db_conn_timeout') or '').strip()
    if not raw:
        return None
    try:
        val = int(raw)
    except ValueError:
        logger.warning("Ignoring non-numeric db_conn_timeout: %r", raw)
        return None
    return val if val > 0 else None


def _coerce_opt_value(value):
    """Coerce an option value to bool/int/float when it looks like one.

    Only 'true'/'false' become booleans — 'yes'/'no'/'on'/'off' stay strings
    because several drivers take them verbatim (e.g. ODBC keywords like
    MultiSubnetFailover=yes must not arrive as Python True).
    """
    lowered = value.lower()
    if lowered == 'true':
        return True
    if lowered == 'false':
        return False
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    return value


def _get_conn_opts(db):
    """Parse db_conn_opts into a dict destined for the DBAPI connect_args.

    Format: 'key=value' pairs separated by newlines or ';'. Blank lines and
    '#' comments are skipped. Only the first '=' splits, so values may
    themselves contain '=' (e.g. options=-c search_path=raw). Malformed
    entries are logged and ignored rather than failing the connection.
    """
    raw = db.get('db_conn_opts') or ''
    opts = {}
    for chunk in re.split(r'[\n;]', str(raw)):
        line = chunk.strip()
        if not line or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        key = key.strip()
        if not sep or not key:
            # Don't log the content: a ';' inside a secret-bearing value
            # produces fragments of the secret in these malformed chunks.
            logger.warning("Ignoring a malformed connection option entry "
                           "(missing '=' separator or empty key)")
            continue
        opts[key] = _coerce_opt_value(value.strip())
    return opts


def _trino_scheme(db, secured):
    """Effective Trino http_scheme, or None to let the client decide by port
    (443 → https, anything else → http — the historical no-auth behavior).

    An explicit db_http_scheme always wins; otherwise the SSL mode decides;
    otherwise default to https whenever credentialed auth is in play, since
    Trino requires TLS for password and JWT auth on standard deployments.
    """
    scheme = str(db.get('db_http_scheme') or '').strip().lower()
    if scheme in ('http', 'https'):
        return scheme
    ssl_mode = _get_ssl_mode(db)
    if ssl_mode == 'disable':
        return 'http'
    if ssl_mode in ('require', 'verify-ca', 'verify-full'):
        return 'https'
    return 'https' if secured else None


def _trino_connect_args(db, secured):
    """connect_args shared by the Trino password/LDAP and JWT paths.

    The SQLAlchemy trino dialect only honours http_scheme via connect_args —
    it ignores ?http_scheme= in the URL query and picks plain HTTP for any
    port other than 443 — so everything TLS-related must be passed here.

    SSL-mode mapping (libpq-style names):
      require              → verify=False (TLS without certificate
                             verification; self-signed coordinator certs)
      verify-ca / -full    → default full verification; a custom CA bundle
                             can be supplied via the extra connection option
                             `verify=/path/to/ca.pem`
      disable              → plain http (unless db_http_scheme says otherwise)
    Extra connection options are merged last, so power users can override any
    of the derived values (e.g. verify, request_timeout, source).
    """
    args = {}
    scheme = _trino_scheme(db, secured)
    if scheme:
        args['http_scheme'] = scheme
    if scheme == 'https' and _get_ssl_mode(db) == 'require':
        args['verify'] = False
    timeout = _get_conn_timeout(db)
    if timeout is not None:
        args['request_timeout'] = float(timeout)
    args.update(_get_conn_opts(db))
    return args


def _pymysql_connect_args(db):
    """connect_args for the pymysql-backed types (MySQL, StarRocks).

    Requires pymysql >= 1.0 (ssl_disabled, SSLContext passthrough, and the
    boolean verify_mode dict key). SSL-mode mapping (libpq-style names):
      disable       → ssl_disabled=True
      require       → TLS enforced, no certificate verification. The dict
                      must be truthy — pymysql gates TLS on `if ssl:`, so an
                      empty dict would silently mean "no TLS at all".
      verify-ca     → TLS + certificate verification against the system trust
                      store, or a custom CA via the extra connection option
                      `ssl_ca=/path/to/ca.pem`. Built as an ssl.SSLContext
                      because pymysql's dict path force-disables hostname
                      checking when no custom CA is given.
      verify-full   → same plus hostname verification.
      allow/prefer  → pymysql default (no TLS), the historical behavior
    """
    args = {}
    ssl_mode = _get_ssl_mode(db)
    opts = _get_conn_opts(db)
    if ssl_mode == 'disable':
        args['ssl_disabled'] = True
    elif ssl_mode == 'require':
        # Truthy dict → CLIENT.SSL is negotiated; verify_mode False →
        # ssl.CERT_NONE. check_hostname must be explicitly False: if a CA is
        # also supplied, pymysql would otherwise default it to True, and
        # Python's ssl module rejects check_hostname with CERT_NONE.
        args['ssl'] = {'verify_mode': False, 'check_hostname': False}
        if 'ssl_ca' in opts:
            args['ssl']['ca'] = opts.pop('ssl_ca')
    elif ssl_mode in ('verify-ca', 'verify-full'):
        import ssl as ssl_module
        ca_path = opts.pop('ssl_ca', None)
        ctx = ssl_module.create_default_context(cafile=ca_path)
        # MySQL's auto-generated self-signed certs fail Python 3.13's
        # VERIFY_X509_STRICT default; relax it like pymysql itself does.
        if hasattr(ssl_module, 'VERIFY_X509_STRICT'):
            ctx.verify_flags &= ~ssl_module.VERIFY_X509_STRICT
        ctx.check_hostname = ssl_mode == 'verify-full'
        args['ssl'] = ctx
    timeout = _get_conn_timeout(db)
    if timeout is not None:
        args['connect_timeout'] = timeout
    args.update(opts)
    return args


def _pg_connect_args(db):
    """connect_args for psycopg2. The form's SSL modes are exactly libpq's
    sslmode values, so they pass straight through; extra connection options
    land as libpq keywords (application_name, sslrootcert, keepalives_idle…).
    """
    args = {}
    ssl_mode = _get_ssl_mode(db)
    if ssl_mode:
        args['sslmode'] = ssl_mode
    timeout = _get_conn_timeout(db)
    if timeout is not None:
        args['connect_timeout'] = timeout
    args.update(_get_conn_opts(db))
    return args


def _warn_ignored_options(dbid, db, label, ssl_supported=False,
                          timeout_supported=False, hint=''):
    """Log when advanced options are set but the driver cannot honor them.

    'disable'/'allow'/'prefer' SSL modes match the driver's plain-TCP
    behavior, so only the TLS-requesting modes warrant a warning.
    """
    suffix = f" ({hint})" if hint else ""
    if not ssl_supported and _get_ssl_mode(db) in ('require', 'verify-ca', 'verify-full'):
        logger.warning(
            "Connection %r: SSL mode %r is not supported for %s and is "
            "ignored%s.", dbid, _get_ssl_mode(db), label, suffix,
        )
    if not timeout_supported and _get_conn_timeout(db) is not None:
        logger.warning(
            "Connection %r: connect timeout is not supported for %s and is "
            "ignored%s.", dbid, label, suffix,
        )


def _hive_tls_engine(dbid, db, db_host, db_port, db_name, db_user, db_pass):
    """Hive (LDAP/password auth) over TLS.

    pyhive has no SSL parameters for the binary SASL transport, and its
    thrift_transport argument conflicts with the host/port/auth/password
    kwargs the SQLAlchemy hive dialect always passes — so build the
    SASL-PLAIN-over-TSSLSocket transport ourselves and hand SQLAlchemy a
    `creator`, which bypasses the dialect's connect arguments entirely.
    A fresh transport is built per pooled connection (a thrift transport
    is a single socket).

    SSL-mode mapping mirrors the other dialects: require → TLS without
    certificate verification; verify-ca → verify against the system trust
    store (or `ssl_ca=/path` extra option); verify-full → plus hostname
    verification (thrift passes the host as server_hostname).
    """
    try:
        from pyhive.hive import Connection as HiveConnection, get_installed_sasl
        from thrift.transport import TSSLSocket
        import thrift_sasl
    except ImportError as exc:
        raise RuntimeError(
            "Hive over TLS requires pyhive[hive]>=0.7 "
            "(pip install jupyterlab-db-explorer[hive])."
        ) from exc
    import ssl as ssl_module

    ssl_mode = _get_ssl_mode(db)
    opts = _get_conn_opts(db)
    ca_path = opts.pop('ssl_ca', None)
    timeout = _get_conn_timeout(db)
    host = db_host
    port = int(db_port)
    database = db_name or 'default'
    # SASL PLAIN needs a non-empty password even for LDAP-less servers.
    password = db_pass or 'x'

    def creator():
        ctx = ssl_module.create_default_context(cafile=ca_path)
        if ssl_mode == 'require':
            ctx.check_hostname = False
            ctx.verify_mode = ssl_module.CERT_NONE
        elif ssl_mode == 'verify-ca':
            ctx.check_hostname = False
        socket = TSSLSocket.TSSLSocket(host=host, port=port, ssl_context=ctx)
        if timeout is not None:
            socket.setTimeout(timeout * 1000)
        transport = thrift_sasl.TSaslClientTransport(
            lambda: get_installed_sasl(
                host=host, sasl_auth='PLAIN',
                username=db_user, password=password,
            ),
            'PLAIN', socket,
        )
        return HiveConnection(
            username=db_user, database=database,
            thrift_transport=transport, **opts,
        )

    # The URL only selects the dialect — the creator makes the connection,
    # so no credentials belong in it.
    sqlstr = f"hive://{host}:{port}/{database}"
    return sqlalchemy.create_engine(sqlstr, creator=creator)


# ---------------------------------------------------------------------------
# Engine creation
# ---------------------------------------------------------------------------

def input_passwd(dbid, db_user=None):
    """Engine creation runs server-side and cannot prompt interactively.

    Callers treat a None engine as 'credentials missing'; the UI drives the
    actual prompt through check_pass/set_pass. Log so notebook/BATCH callers
    can see why no engine was created.
    """
    logger.warning(
        "Connection %r needs a password (user=%r) and no interactive prompt "
        "is available here — use the DB Explorer panel to enter it.",
        dbid, db_user,
    )


def _getSQL_engine(dbid, db, usedb=None):
    db_host = db.get('db_host', '')
    db_name = db.get('db_name', '')

    # Resolve vault:// URLs in user and pass (no-op for non-vault values).
    db_user_raw = _resolve_vault_secret(db.get('db_user', ''))
    db_pass_raw = _resolve_vault_secret(db.get('db_pass', ''))

    # JWT auth (Trino & StarRocks): db_pass holds the bearer token rather than
    # a password. Only those two types honour 'jwt'; everything else ignores it.
    db_auth_type = (db.get('db_auth_type') or 'password').lower()
    use_jwt = (
        db_auth_type == 'jwt'
        and db['db_type'] in (DB_TRINO, DB_STARROCKS)
    )

    if usedb is not None and db['db_type'] in [
        DB_MYSQL, DB_STARROCKS, DB_HIVE_LDAP, DB_HIVE_KERBEROS, DB_PGSQL,
        DB_SQLSERVER
    ]:
        db_name = usedb

    if db['db_type'] == DB_HIVE_KERBEROS:
        db_port = db.get('db_port', 10000)
        principal = db['principal']
        os.system(f"kinit -kt /opt/conda/etc/keytab_{dbid} {principal}")
        # GSSAPI over the TLS transport is untested territory — only the
        # LDAP/password Hive path supports SSL modes for now.
        _warn_ignored_options(dbid, db, 'Kerberos Hive')
        kerb_suffix = f"/{db_name}" if db_name else ""
        sqlstr = f"hive://{db_host}:{db_port}{kerb_suffix}"
        kerb_args = {'auth': 'KERBEROS', 'kerberos_service_name': 'hive'}
        kerb_args.update(_get_conn_opts(db))
        return sqlalchemy.create_engine(sqlstr, connect_args=kerb_args)

    # Types that can connect without any credentials at all
    _NO_AUTH_TYPES = (DB_SQLITE, DB_HIVE_KERBEROS, DB_TRINO)

    # Resolve user/pass
    db_user = None
    db_pass_encoded = None
    db_pass_plain = None
    jwt_token = None
    if use_jwt:
        # JWT: token sits in db_pass; identity from db_user when present.
        # If the token is missing (and not in temp store), prompt for it just
        # like a password — set_pass writes the token into 'pwd'.
        if db_pass_raw:
            jwt_token = db_pass_raw
            db_user = db_user_raw or None
        elif dbid in _temp_pass_store:
            jwt_token = _temp_pass_store[dbid]['pwd']
            db_user = db_user_raw or _temp_pass_store[dbid].get('user') or None
        else:
            db_user_hint = db.get('db_user', None)
            input_passwd(dbid, db_user_hint)
            return
    elif db['db_type'] not in _NO_AUTH_TYPES:
        # Stored credentials are used only when both are configured; a stored
        # username with no stored password falls through to the temp store
        # (filled by the UI prompt) — mirroring check_pass — instead of
        # silently attempting an empty password.
        if db_user_raw and 'db_pass' in db:
            db_user = db_user_raw
            db_pass_plain = db_pass_raw
            db_pass_encoded = quote_plus(db_pass_raw)
        elif dbid in _temp_pass_store:
            db_user = _temp_pass_store[dbid]['user'] or db_user_raw
            db_pass_plain = _temp_pass_store[dbid]['pwd']
            db_pass_encoded = quote_plus(db_pass_plain)
        else:
            db_user_hint = db.get('db_user', None)
            input_passwd(dbid, db_user_hint)
            return
    elif db['db_type'] == DB_TRINO:
        # Trino can run without any auth, so it never *requires* stored
        # credentials — but when the connection is unambiguously TLS
        # (LDAP-style setups) and a username is configured without a
        # password, honor the same prompt + temp-store flow as other types.
        db_user = db_user_raw or None
        trino_pass = db_pass_raw or ''
        if not trino_pass and dbid in _temp_pass_store:
            db_user = db_user or _temp_pass_store[dbid].get('user') or None
            trino_pass = _temp_pass_store[dbid]['pwd']
        if db_user and not trino_pass and _trino_scheme(db, secured=False) == 'https':
            input_passwd(dbid, db.get('db_user', None))
            return
        # Trino requires at least a username; default to 'trino'.
        db_user = db_user or 'trino'

    db_suffix = f"/{db_name}" if db_name else ""
    connect_args = {}

    if db['db_type'] == DB_MYSQL:
        db_port = db.get('db_port', 3306)
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}{db_suffix}"
        connect_args = _pymysql_connect_args(db)

    elif db['db_type'] == DB_PGSQL:
        # PostgreSQL always needs a connect-time database; default to the
        # `postgres` maintenance DB when none is configured so the user can
        # browse every other DB they have CONNECT on.
        db_port = db.get('db_port', 5432)
        pg_db = db_name or 'postgres'
        sqlstr = f"postgresql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{pg_db}"
        connect_args = _pg_connect_args(db)

    elif db['db_type'] == DB_ORACLE:
        db_port = db.get('db_port', 1521)
        if not db_name:
            raise ValueError("Oracle requires a database/service name")
        # cx_Oracle has no SSL/timeout connect kwargs — both live inside the
        # DSN. A full descriptor supplied as the extra connection param
        # `dsn=(DESCRIPTION=...)` overrides the URL-built one (see README).
        _warn_ignored_options(
            dbid, db, 'Oracle',
            hint="use a dsn=(DESCRIPTION=...) extra connection param for "
                 "TCPS and connect timeouts",
        )
        sqlstr = f"oracle+cx_Oracle://{db_user}:{db_pass_encoded}@{db_host}:{db_port}/{db_name}"
        connect_args = _get_conn_opts(db)

    elif db['db_type'] == DB_HIVE_LDAP:
        db_port = db.get('db_port', 10000)
        if _get_ssl_mode(db) in ('require', 'verify-ca', 'verify-full'):
            return _hive_tls_engine(
                dbid, db, db_host, db_port, db_name, db_user, db_pass_plain,
            )
        # Plain SASL transport: pyhive exposes no timeout knob there — only
        # the TLS path owns its socket and can set one.
        _warn_ignored_options(
            dbid, db, 'Hive without TLS', ssl_supported=True,
            hint="set an SSL mode to enable the TLS transport, which honors "
                 "the timeout",
        )
        sqlstr = f"hive://{db_user}:{db_pass_encoded}@{db_host}:{db_port}{db_suffix}"
        hive_args = {'auth': 'LDAP'}
        hive_args.update(_get_conn_opts(db))
        return sqlalchemy.create_engine(sqlstr, connect_args=hive_args)

    elif db['db_type'] == DB_SQLITE:
        sqlite_args = _get_conn_opts(db)
        timeout = _get_conn_timeout(db)
        if timeout is not None:
            sqlite_args.setdefault('timeout', timeout)
        if db_name == ':memory:':
            sqlstr = "sqlite+pysqlite:///:memory:"
            return sqlalchemy.create_engine(sqlstr, connect_args=sqlite_args)
        if db_name[0] != '/':
            db_name = os.path.expanduser(DB_ROOT + db_name)
        dir_name = os.path.dirname(db_name)
        if dir_name and not os.path.isdir(dir_name):
            os.makedirs(dir_name, exist_ok=True)
        sqlstr = f"sqlite+pysqlite:///{db_name}"
        return sqlalchemy.create_engine(sqlstr, connect_args=sqlite_args)

    elif db['db_type'] == DB_TRINO:
        db_port = db.get('db_port', 8080)
        if use_jwt:
            # Username is optional with JWT — the token carries the identity —
            # but the SQLAlchemy URL still requires a user component, so fall
            # back to 'trino'. Password slot is empty: the bearer goes into
            # connect_args.
            trino_user = db_user or 'trino'
            sqlstr = f"trino://{quote_plus(trino_user)}@{db_host}:{db_port}{db_suffix}"
            try:
                from trino.auth import JWTAuthentication
            except ImportError as exc:
                raise RuntimeError(
                    "Trino JWT auth requires the 'trino' package "
                    "(pip install jupyterlab-db-explorer[trino])."
                ) from exc
            trino_args = _trino_connect_args(db, secured=True)
            # Raw username via connect_args: the URL slot is decoded twice
            # (SQLAlchemy unquotes, then the dialect unquote_plus's), which
            # would turn any '+' in the identity into a space.
            trino_args.setdefault('user', trino_user)
            trino_args['auth'] = JWTAuthentication(jwt_token)
            return sqlalchemy.create_engine(
                sqlstr,
                connect_args=trino_args,
                pool_size=20, max_overflow=20, pool_timeout=30000, echo=False,
            )
        # Password/LDAP (and no-auth) path. The password must NOT ride in the
        # URL: the trino dialect would then pick plain HTTP for any port
        # other than 443 and send the credentials in cleartext to a TLS-only
        # coordinator. Both scheme and credentials go through connect_args.
        trino_args = _trino_connect_args(db, secured=bool(trino_pass))
        # Raw username via connect_args: the URL slot is decoded twice
        # (SQLAlchemy unquotes, then the dialect unquote_plus's), which
        # would turn any '+' in an LDAP identity into a space.
        trino_args.setdefault('user', db_user)
        if trino_pass:
            if trino_args.get('http_scheme') == 'http':
                logger.warning(
                    "Trino connection %r sends its password over plain HTTP "
                    "(scheme explicitly set to http) — credentials are not "
                    "encrypted in transit.", dbid,
                )
            try:
                from trino.auth import BasicAuthentication
            except ImportError as exc:
                raise RuntimeError(
                    "Trino password auth requires the 'trino' package "
                    "(pip install jupyterlab-db-explorer[trino])."
                ) from exc
            trino_args['auth'] = BasicAuthentication(db_user, trino_pass)
        sqlstr = f"trino://{quote_plus(db_user)}@{db_host}:{db_port}{db_suffix}"
        return sqlalchemy.create_engine(
            sqlstr,
            connect_args=trino_args,
            pool_size=20, max_overflow=20, pool_timeout=30000, echo=False,
        )

    elif db['db_type'] == DB_STARROCKS:
        db_port = db.get('db_port', 9030)
        if use_jwt:
            # StarRocks 3.5+ accepts a JWT in place of a password via the MySQL
            # mysql_clear_password plugin. pymysql sends the password verbatim
            # when the server requests that plugin, so we just route the token
            # through the URL's password slot.
            sr_user = db_user or db.get('db_user', '') or ''
            if not sr_user:
                raise ValueError("StarRocks JWT auth requires a username")
            sqlstr = (
                f"mysql+pymysql://{sr_user}:{quote_plus(jwt_token)}"
                f"@{db_host}:{db_port}{db_suffix}"
            )
            return sqlalchemy.create_engine(
                sqlstr,
                connect_args=_pymysql_connect_args(db),
                pool_size=20, max_overflow=20, pool_timeout=30000, echo=False,
            )
        sqlstr = f"mysql+pymysql://{db_user}:{db_pass_encoded}@{db_host}:{db_port}{db_suffix}"
        connect_args = _pymysql_connect_args(db)

    elif db['db_type'] == DB_SQLSERVER:
        db_port = db.get('db_port', 1433)
        # Mirrors the PG pattern: when no default DB is configured connect to
        # `master` so the user can list every database they can access.
        sqlserver_db = db_name or 'master'
        driver = 'ODBC+Driver+18+for+SQL+Server'
        # ODBC Driver 18 encrypts by default. SSL-mode mapping:
        #   verify-ca / verify-full → full certificate verification
        #   disable                 → no encryption
        #   unset / allow / prefer / require → TrustServerCertificate=yes,
        #     the historical default (encrypted, self-signed certs accepted).
        ssl_mode = _get_ssl_mode(db)
        if ssl_mode in ('verify-ca', 'verify-full'):
            tls_query = '&Encrypt=yes'
        elif ssl_mode == 'disable':
            tls_query = '&Encrypt=no'
        else:
            tls_query = '&TrustServerCertificate=yes'
        sqlstr = (
            f"mssql+pyodbc://{db_user}:{db_pass_encoded}@{db_host}:{db_port}"
            f"/{sqlserver_db}?driver={driver}{tls_query}"
        )
        # pyodbc's `timeout` kwarg is the login timeout in seconds; extra
        # options become ODBC connection-string attributes.
        timeout = _get_conn_timeout(db)
        if timeout is not None:
            connect_args['timeout'] = timeout
        connect_args.update(_get_conn_opts(db))

    else:
        raise ValueError("unsupported database type")

    return sqlalchemy.create_engine(
        sqlstr,
        connect_args=connect_args,
        pool_size=20, max_overflow=20, pool_timeout=30000, echo=False,
    )


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
        is_jwt = (
            (db.get('db_auth_type') or '').lower() == 'jwt'
            and db.get('db_type') in (DB_TRINO, DB_STARROCKS)
        )

        if is_jwt:
            # JWT path: token lives in db_pass; username is optional for Trino
            # but required for StarRocks. Reject unresolved vault:// placeholders.
            resolved_token = _resolve_vault_secret(db.get('db_pass', ''))
            if not resolved_token or (
                isinstance(resolved_token, str) and resolved_token.startswith('vault://')
            ):
                return False, 'JWT token is required for test'
            if db.get('db_type') == DB_STARROCKS:
                resolved_user = _resolve_vault_secret(db.get('db_user', ''))
                if not resolved_user or (
                    isinstance(resolved_user, str) and resolved_user.startswith('vault://')
                ):
                    return False, 'username is required for StarRocks JWT'
        # For types that require user/pass, check they are provided.
        # Resolve vault:// first so an unresolved placeholder isn't accepted.
        elif db.get('db_type') not in no_auth_types:
            resolved_user = _resolve_vault_secret(db.get('db_user', ''))
            if not resolved_user or (
                isinstance(resolved_user, str) and resolved_user.startswith('vault://')
            ):
                return False, 'username is required for test'
        elif db.get('db_type') == DB_TRINO:
            # A TLS Trino connection with a username is password auth (LDAP);
            # without a password the engine would only prompt, not connect.
            resolved_user = _resolve_vault_secret(db.get('db_user', ''))
            resolved_pass = _resolve_vault_secret(db.get('db_pass', ''))
            if (
                resolved_user and not resolved_pass
                and _trino_scheme(db, secured=False) == 'https'
            ):
                return False, 'password is required for test'

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

    is_jwt = (
        (dbinfo.get('db_auth_type') or '').lower() == 'jwt'
        and dbinfo['db_type'] in (DB_TRINO, DB_STARROCKS)
    )

    if not is_jwt and dbinfo['db_type'] in (DB_HIVE_KERBEROS, DB_SQLITE):
        return (True, None)

    if not is_jwt and dbinfo['db_type'] == DB_TRINO:
        # Trino can be credential-less, so only insist on a password when
        # the connection is unambiguously TLS (explicit https scheme or an
        # SSL mode that implies TLS — LDAP-style setups) and a username is
        # configured without a stored password.
        if (
            _trino_scheme(dbinfo, secured=False) == 'https'
            and dbinfo.get('db_user')
            and not dbinfo.get('db_pass')
            and dbid not in _temp_pass_store
        ):
            return (False, dbinfo.get('db_user', ''))
        return (True, None)

    if 'db_user' in dbinfo and 'db_pass' in dbinfo:
        return (True, None)

    # JWT Trino doesn't strictly need a username — only a token.
    if is_jwt and dbinfo['db_type'] == DB_TRINO and dbinfo.get('db_pass'):
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
        clear_vault_cache()
    elif dbid in _temp_pass_store:
        del _temp_pass_store[dbid]
