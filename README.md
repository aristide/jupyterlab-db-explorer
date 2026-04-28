[![Build](https://github.com/groupnotes/jupyterlab-db-explorer/actions/workflows/build.yml/badge.svg)](https://github.com/groupnotes/jupyterlab-db-explorer/actions/workflows/build.yml)
[![PyPI](https://img.shields.io/pypi/v/jupyterlab-db-explorer.svg)](https://pypi.org/project/jupyterlab-db-explorer/)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/groupnotes/jupyterlab-db-explorer/main?urlpath=lab)

# jupyterlab-db-explorer

A JupyterLab extension for browsing database objects and running SQL queries. Supports multiple database engines including MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, and StarRocks.

## Features

- Browse and navigate data objects (tables, views, columns) using a tree structure.
- Run SQL statements directly in JupyterLab and view results.
- Support for multiple databases: MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, StarRocks.
- Edit annotations for data objects with local and shared (team database) modes.

## Requirements

- JupyterLab >= 4.0 (for JupyterLab 3.x use version 0.1.x)
- sqlalchemy >= 1.4

## Install

```bash
pip install jupyterlab-db-explorer
```

Install with a specific database driver:

```bash
pip install jupyterlab-db-explorer[pgsql]
pip install jupyterlab-db-explorer[trino]
pip install jupyterlab-db-explorer[hive]
pip install jupyterlab-db-explorer[mysql]
```

## Uninstall

```bash
pip uninstall jupyterlab-db-explorer
```

## Usage

### Add Database Connection

Open the dialog to add a data connection via "Database -> New Connection" from the menu.

### Configure via Environment Variables

You can configure database connections using environment variables. This is useful for containerized environments, CI/CD pipelines, or when you want to pre-configure connections.

#### Multiple Connections (Recommended)

Use the `DB_CONN_<NAME>_<FIELD>` pattern for each connection. Each connection is identified by a `<NAME>` you choose:

```bash
# Production MySQL
export DB_CONN_PRODUCTION_TYPE=1
export DB_CONN_PRODUCTION_HOST=192.168.1.100
export DB_CONN_PRODUCTION_PORT=3306
export DB_CONN_PRODUCTION_USER=admin
export DB_CONN_PRODUCTION_PASS=secret
export DB_CONN_PRODUCTION_NAME=prod_db

# Analytics PostgreSQL
export DB_CONN_ANALYTICS_TYPE=2
export DB_CONN_ANALYTICS_HOST=192.168.1.200
export DB_CONN_ANALYTICS_PORT=5432
export DB_CONN_ANALYTICS_USER=analyst
export DB_CONN_ANALYTICS_PASS=password
export DB_CONN_ANALYTICS_NAME=analytics

# Trino (no password needed)
export DB_CONN_TRINO_TYPE=7
export DB_CONN_TRINO_HOST=trino.example.com
export DB_CONN_TRINO_PORT=8080
export DB_CONN_TRINO_USER=trino
export DB_CONN_TRINO_NAME=postgresql
```

#### Using HashiCorp Vault for Passwords

For enhanced security, passwords can be stored in HashiCorp Vault instead of plain text. Use the `vault://` URL scheme in any password or username field:

```
vault://secret/path#field
```

- `secret/path` is the KV secret path in Vault
- `field` is the field name within that secret (e.g., `password`, `username`)

**Example:**

```bash
# Store password in Vault first:
vault kv put secret/database/production password="actual_prod_password" username="prod_user"

# Reference it in your connection:
export DB_CONN_PRODUCTION_TYPE=1
export DB_CONN_PRODUCTION_HOST=192.168.1.100
export DB_CONN_PRODUCTION_PORT=3306
export DB_CONN_PRODUCTION_USER=vault://secret/database/production#username
export DB_CONN_PRODUCTION_PASS=vault://secret/database/production#password
export DB_CONN_PRODUCTION_NAME=prod_db
```

**Vault Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_ENABLED` | `true` | Set to `false`/`0`/`no`/`off` to bypass Vault entirely, even when `VAULT_ADDR` is set. |
| `VAULT_ADDR` | *(unset)* | Vault server address (e.g. `https://vault.example.com`). Vault integration is disabled when empty. |
| `VAULT_AUTH_METHOD` | `token` | Auth method: `token` or `approle`. |
| `VAULT_TOKEN` | *(unset)* | Token when `VAULT_AUTH_METHOD=token`. |
| `VAULT_ROLE_ID` | *(unset)* | AppRole role id when `VAULT_AUTH_METHOD=approle`. |
| `VAULT_SECRET_ID` | *(unset)* | AppRole secret id when `VAULT_AUTH_METHOD=approle`. |
| `VAULT_KV_MOUNT` | `secret` | KV v2 mount point. |

The dev `docker-compose.yaml` sets `VAULT_ADDR` and `VAULT_TOKEN=devtoken` explicitly for the bundled dev Vault. Outside that setup, both vars must be set by you — there are no production defaults.

**Security notes:**
- The dev Vault runs in-memory with a fixed root token — **never use in production**.
- For production, prefer AppRole (`VAULT_AUTH_METHOD=approle`) or a sidecar that renews a short-lived token.
- Only KV v2 is supported; the mount is configurable via `VAULT_KV_MOUNT`.
- Secrets are cached for 5 minutes, so rotating a secret in Vault takes up to 5 minutes to take effect. Call `clear_pass()` (no args) to flush the cache immediately.
- Failures (Vault unreachable, missing field, malformed URL) leave the original `vault://...` string in place so the resulting DB auth error is explicit rather than silent.
- For incident response or local debugging, set `VAULT_ENABLED=false` to short-circuit all Vault calls without touching `VAULT_ADDR` or rewriting connection strings.

#### Single Connection (Legacy)

For a single connection, use the individual `DB_*` variables:

```bash
export DB_TYPE=1
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASS=password
export DB_NAME=testdb
export DB_ID=default
```

#### Advanced: Base64 JSON

For sensitive data, you can also use base64-encoded JSON with `DB_<NAME>`:

```bash
export DB_MYDB=$(echo '{"db_type":"1","db_host":"localhost","db_port":"3306","db_user":"root","db_pass":"secret","db_name":"testdb"}' | base64 -w0)
```

#### Allowed Database Types

By default, all database types are allowed. To restrict which types can be used, set:

```bash
export DB_EXPLORER_ALLOWED_TYPES=1,2,7
```

You can use type codes or names: `mysql`, `pgsql`, `postgres`, `oracle`, `hive`, `hive-ldap`, `hive-kerberos`, `sqlite`, `trino`, `starrocks`.

#### Database Type Codes

| Code | Database |
|------|----------|
| 1 | MySQL |
| 2 | PostgreSQL |
| 3 | Oracle |
| 4 | Hive LDAP |
| 5 | Hive Kerberos |
| 6 | SQLite |
| 7 | Trino |
| 8 | StarRocks |

### Edit Comments

Right-click on a connection, table, or column in the database navigation tree and select "Edit Comment" to add or modify comments.

### Share Comments

By default, comments are saved locally. To share within a team, add the following to `$HOME/.jupyter/jupyter_notebook_config.py` (on Windows `%USERPROFILE%/.jupyter/jupyter_notebook_config.py`):

```python
c.JupyterLabSqlExplorer.comments_store = 'database::your_database_connection_string'
```

For example, with MySQL:

```python
c.JupyterLabSqlExplorer.comments_store = 'database::mysql+pymysql://root:12345@192.168.1.100:3306/data'
```

## Troubleshoot

Check server extension is enabled:

```bash
jupyter server extension list
```

Check frontend extension is installed:

```bash
jupyter labextension list
```

## Development

### Devcontainer

The project includes a devcontainer with PostgreSQL, Trino, and StarRocks services for testing. Each database can be enabled or disabled via the `COMPOSE_PROFILES` variable in `.devcontainer/.env`. See [.devcontainer/README.md](.devcontainer/README.md) for details.

### Manual Setup

You will need NodeJS to build the extension. The `jlpm` command is JupyterLab's pinned version of [yarn](https://yarnpkg.com/).

```bash
# Install package in development mode
pip install -e ".[test,pgsql,trino]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Enable server extension
jupyter server extension enable jupyterlab_db_explorer
# Build extension
jlpm build
```

Watch for changes during development:

```bash
# Terminal 1: watch and rebuild on changes
jlpm watch
# Terminal 2: run JupyterLab
jupyter lab
```

### Development Uninstall

```bash
jupyter server extension disable jupyterlab_db_explorer
pip uninstall jupyterlab-db-explorer
```

Also remove the symlink created by `jupyter labextension develop`. Run `jupyter labextension list` to find the `labextensions` folder, then remove the `jupyterlab-db-explorer` symlink.

### Testing

#### Server tests

```bash
pip install -e ".[test]"
jupyter labextension develop . --overwrite
pytest -vv -r ap --cov jupyterlab-db-explorer
```

#### Frontend tests

```bash
jlpm
jlpm test
```

#### Integration tests

Uses [Playwright](https://playwright.dev/) via the [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) helper. See [ui-tests/README.md](./ui-tests/README.md).

### Packaging

See [RELEASE.md](RELEASE.md).
