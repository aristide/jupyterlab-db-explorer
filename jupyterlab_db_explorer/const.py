DB_ROOT = '~/.database/'

# Store for user-defined SQL variables (name -> {value, description}).
# Referenced in SQL as ${name}; resolved at query time, falling back to os.environ.
VAR_CFG = DB_ROOT + 'variables.json'

# Environment variable names for single connection
ENV_DB_TYPE = 'DB_TYPE'
ENV_DB_HOST = 'DB_HOST'
ENV_DB_PORT = 'DB_PORT'
ENV_DB_USER = 'DB_USER'
ENV_DB_PASS = 'DB_PASS'
ENV_DB_NAME = 'DB_NAME'
ENV_DB_ID = 'DB_ID'
# Trino/StarRocks JWT auth. AUTH_TYPE='jwt' makes DB_PASS the bearer token.
# HTTP_SCHEME is Trino-only ('http'/'https'; defaults to https whenever
# credentialed auth is in play, else the client decides by port).
ENV_DB_AUTH_TYPE = 'DB_AUTH_TYPE'
ENV_DB_HTTP_SCHEME = 'DB_HTTP_SCHEME'

# Advanced connection options (honored per-dialect, see engine.py):
# - SSL_MODE: libpq-style mode (disable/allow/prefer/require/verify-ca/verify-full)
# - CONN_TIMEOUT: connect timeout in seconds
# - CONN_OPTS: extra DBAPI connect params, 'key=value' pairs separated by
#   newlines or ';'
ENV_DB_SSL_MODE = 'DB_SSL_MODE'
ENV_DB_CONN_TIMEOUT = 'DB_CONN_TIMEOUT'
ENV_DB_CONN_OPTS = 'DB_CONN_OPTS'

# Environment variable to control reset functionality (default: enabled)
ENV_ALLOW_RESET = 'DB_EXPLORER_ALLOW_RESET'

# Environment variable to restrict allowed database types (comma-separated codes or names)
# e.g. "2,7" or "pgsql,trino"
ENV_ALLOWED_TYPES = 'DB_EXPLORER_ALLOWED_TYPES'

# Prefix for human-readable multi-connection env vars: DB_CONN_<NAME>_<FIELD>
ENV_DB_CONN_PREFIX = 'DB_CONN_'

# Field suffixes for DB_CONN_<NAME>_<FIELD>
ENV_DB_CONN_SUFFIX_TYPE = '_TYPE'
ENV_DB_CONN_SUFFIX_HOST = '_HOST'
ENV_DB_CONN_SUFFIX_PORT = '_PORT'
ENV_DB_CONN_SUFFIX_USER = '_USER'
ENV_DB_CONN_SUFFIX_PASS = '_PASS'
ENV_DB_CONN_SUFFIX_NAME = '_NAME'
ENV_DB_CONN_SUFFIX_ID = '_ID'
# JWT auth (Trino & StarRocks). When AUTH_TYPE='jwt', the PASS field holds the
# bearer token. HTTP_SCHEME is Trino-only.
ENV_DB_CONN_SUFFIX_AUTH_TYPE = '_AUTH_TYPE'
ENV_DB_CONN_SUFFIX_HTTP_SCHEME = '_HTTP_SCHEME'
# Advanced connection options — same semantics as the DB_SSL_MODE /
# DB_CONN_TIMEOUT / DB_CONN_OPTS singles above.
ENV_DB_CONN_SUFFIX_SSL_MODE = '_SSL_MODE'
ENV_DB_CONN_SUFFIX_TIMEOUT = '_TIMEOUT'
ENV_DB_CONN_SUFFIX_OPTS = '_OPTS'

# Result-cursor session tuning. All optional, sensible defaults below.
# - QUERY_LIMIT: max rows the streaming cursor will scroll through before
#   stopping. Bounds server memory for the page-cache.
# - RESULT_TTL_SEC: how long an idle ResultSession stays alive before being
#   evicted from task store (and its DB connection closed).
# - MAX_CACHED_RESULTS: LRU bound on the number of concurrent ResultSessions.
# - RESULT_PAGE_SIZE: rows per page fetched from the cursor + cached.
ENV_QUERY_LIMIT = 'DB_EXPLORER_QUERY_LIMIT'
ENV_RESULT_TTL_SEC = 'DB_EXPLORER_RESULT_TTL_SEC'
ENV_MAX_CACHED_RESULTS = 'DB_EXPLORER_MAX_CACHED_RESULTS'
ENV_RESULT_PAGE_SIZE = 'DB_EXPLORER_RESULT_PAGE_SIZE'
