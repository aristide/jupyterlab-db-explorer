DB_ROOT = '~/.database/'

# Environment variable names for single connection
ENV_DB_TYPE = 'DB_TYPE'
ENV_DB_HOST = 'DB_HOST'
ENV_DB_PORT = 'DB_PORT'
ENV_DB_USER = 'DB_USER'
ENV_DB_PASS = 'DB_PASS'
ENV_DB_NAME = 'DB_NAME'
ENV_DB_ID = 'DB_ID'

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
