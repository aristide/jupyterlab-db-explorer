[![Build](https://github.com/aristide/jupyterlab-db-explorer/actions/workflows/build.yml/badge.svg)](https://github.com/aristide/jupyterlab-db-explorer/actions/workflows/build.yml)
[![PyPI](https://img.shields.io/pypi/v/jupyterlab-db-explorer.svg)](https://pypi.org/project/jupyterlab-db-explorer/)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/aristide/jupyterlab-db-explorer/master?urlpath=lab)

# jupyterlab-db-explorer

A JupyterLab extension for browsing database objects and running SQL queries. Supports multiple database engines including MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, StarRocks, and SQL Server.

## Features

- Browse and navigate data objects (tables, views, columns) using a tree structure.
- Run SQL statements directly in JupyterLab and view results.
- Support for multiple databases: MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, StarRocks, SQL Server.
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
pip install jupyterlab-db-explorer[sqlserver]
```

The `[sqlserver]` extra installs the `pyodbc` Python driver. SQL Server also requires the **ODBC Driver 18 for SQL Server** to be installed on the host OS (it is not a Python package). See Microsoft's install instructions for your platform: <https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server>.

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

# Trino with JWT bearer token (see "JWT Authentication" below)
export DB_CONN_TRINO_JWT_TYPE=7
export DB_CONN_TRINO_JWT_HOST=trino.example.com
export DB_CONN_TRINO_JWT_PORT=443
export DB_CONN_TRINO_JWT_USER=analyst          # optional — JWT carries identity
export DB_CONN_TRINO_JWT_PASS=eyJhbGciOi...    # the bearer token
export DB_CONN_TRINO_JWT_AUTH_TYPE=jwt
export DB_CONN_TRINO_JWT_HTTP_SCHEME=https     # optional, default 'https'
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

| Variable            | Default   | Description                                                                                        |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `VAULT_ENABLED`     | `true`    | Set to `false`/`0`/`no`/`off` to bypass Vault entirely, even when `VAULT_ADDR` is set.             |
| `VAULT_ADDR`        | _(unset)_ | Vault server address (e.g. `https://vault.example.com`). Vault integration is disabled when empty. |
| `VAULT_AUTH_METHOD` | `token`   | Auth method: `token` or `approle`.                                                                 |
| `VAULT_TOKEN`       | _(unset)_ | Token when `VAULT_AUTH_METHOD=token`.                                                              |
| `VAULT_ROLE_ID`     | _(unset)_ | AppRole role id when `VAULT_AUTH_METHOD=approle`.                                                  |
| `VAULT_SECRET_ID`   | _(unset)_ | AppRole secret id when `VAULT_AUTH_METHOD=approle`.                                                |
| `VAULT_KV_MOUNT`    | `secret`  | KV v2 mount point.                                                                                 |

The dev `docker-compose.yaml` sets `VAULT_ADDR` and `VAULT_TOKEN=devtoken` explicitly for the bundled dev Vault. Outside that setup, both vars must be set by you — there are no production defaults.

**Security notes:**

- The dev Vault runs in-memory with a fixed root token — **never use in production**.
- For production, prefer AppRole (`VAULT_AUTH_METHOD=approle`) or a sidecar that renews a short-lived token.
- Only KV v2 is supported; the mount is configurable via `VAULT_KV_MOUNT`.
- Secrets are cached for 5 minutes, so rotating a secret in Vault takes up to 5 minutes to take effect. Call `clear_pass()` (no args) to flush the cache immediately.
- Failures (Vault unreachable, missing field, malformed URL) leave the original `vault://...` string in place so the resulting DB auth error is explicit rather than silent.
- For incident response or local debugging, set `VAULT_ENABLED=false` to short-circuit all Vault calls without touching `VAULT_ADDR` or rewriting connection strings.

#### JWT Authentication (Trino & StarRocks)

Trino and StarRocks can be authenticated with a JWT bearer token instead of a password. The token replaces the password everywhere — in the new-connection dialog you flip the **Auth method** switch to **JWT token**, and via env vars you set `*_AUTH_TYPE=jwt` and put the token in the `*_PASS` field.

##### Via the new-connection dialog

1. Open the database tree's **+** button → **New connection**.
2. In **Database type**, pick **Trino** or **StarRocks**.
3. Fill in **Host**, **Port** (443 for Trino + JWT, 9030 for StarRocks), and optionally **Database / schema**.
4. In the **Authentication** section, click the **JWT token** segment of the **Auth method** switch (only visible for Trino & StarRocks).
   - The password input is replaced by a multi-line **JWT token** field — paste the full `eyJ…` bearer in there.
   - For Trino, **Username** becomes optional — the JWT carries the identity. For StarRocks, **Username** is still required (it maps the token to a role).
   - For Trino, an extra **HTTP scheme** dropdown appears. Leave it on **https** unless your coordinator is behind a TLS-terminating proxy and you've intentionally exposed plain HTTP.
5. (Optional) Click **Test connection** before saving — the same validation runs against the live server so you find token/permission issues now rather than on first query.
6. **Create** to save. The token is stored in `~/.database/db_conf.json` alongside the rest of the connection record.

If your token lives in Vault, flip **Credential source → Vault reference** first; the JWT field will then accept a `vault://path#field` URL and the bearer is resolved server-side at connect time.

##### Via environment variables

The recipe is the same for both engines — only the type code and a couple of host/port defaults differ. For every connection you want to expose:

1. **Pick a `<NAME>`** — an uppercase short tag (`PROD`, `WAREHOUSE`, `TRINO_DEV`, …). All five variables for that connection share this `<NAME>` slot. The explorer auto-discovers it at startup.
2. **Set the type code:** `DB_CONN_<NAME>_TYPE=7` for Trino, `DB_CONN_<NAME>_TYPE=8` for StarRocks.
3. **Set the network coordinates:** `DB_CONN_<NAME>_HOST` and `DB_CONN_<NAME>_PORT` (Trino: typically `443` over HTTPS; StarRocks: `9030`, the MySQL-protocol query port).
4. **Set `DB_CONN_<NAME>_AUTH_TYPE=jwt`.** Without this, the `_PASS` field is treated as a normal password.
5. **Put the bearer token in `DB_CONN_<NAME>_PASS`.** It can be the raw `eyJ…` string or a `vault://path#field` reference.
6. **Set `DB_CONN_<NAME>_USER`** — _required_ for StarRocks (the username is what maps the JWT to a StarRocks role), _optional_ for Trino (the token's `sub` claim already carries the identity; the explorer falls back to `trino` if you omit it).
7. **Trino only — optionally** set `DB_CONN_<NAME>_HTTP_SCHEME=http` if you're talking to a dev coordinator behind a TLS-terminating proxy. Default is `https` and that's the only safe setting in production.
8. _(Optional)_ `DB_CONN_<NAME>_NAME` to pin a default catalog/database; leave it unset to browse everything the token has access to.

**Trino (HTTPS + JWT):**

```bash
export DB_CONN_TRINO_TYPE=7
export DB_CONN_TRINO_HOST=trino.example.com
export DB_CONN_TRINO_PORT=443
export DB_CONN_TRINO_USER=analyst          # optional — token carries identity
export DB_CONN_TRINO_PASS=eyJhbGciOi...    # JWT bearer token
export DB_CONN_TRINO_AUTH_TYPE=jwt
# DB_CONN_TRINO_HTTP_SCHEME=https           # default; set 'http' only for dev coordinators behind a TLS terminator
```

The token is handed to the Trino client via `trino.auth.JWTAuthentication`; the URL itself never contains the bearer. JWT auth requires the `trino` extra (`pip install jupyterlab-db-explorer[trino]`).

**StarRocks (3.5+):**

```bash
export DB_CONN_SR_TYPE=8
export DB_CONN_SR_HOST=fe.example.com
export DB_CONN_SR_PORT=9030
export DB_CONN_SR_USER=svc_jwt             # required — maps the JWT to a StarRocks role
export DB_CONN_SR_PASS=eyJhbGciOi...        # JWT
export DB_CONN_SR_AUTH_TYPE=jwt
```

The token is sent through StarRocks's `mysql_clear_password` auth handshake — make sure your FE is configured to accept JWTs and **only use this over a network you trust** (or an SSL-terminating proxy), since `mysql_clear_password` does not encrypt the token in transit.

**Both engines side-by-side** — copy this block to expose one of each at the same time:

```bash
# Trino
export DB_CONN_TRINO_TYPE=7
export DB_CONN_TRINO_HOST=trino.example.com
export DB_CONN_TRINO_PORT=443
export DB_CONN_TRINO_PASS=eyJhbGciOi...trino-token...
export DB_CONN_TRINO_AUTH_TYPE=jwt

# StarRocks
export DB_CONN_SR_TYPE=8
export DB_CONN_SR_HOST=fe.example.com
export DB_CONN_SR_PORT=9030
export DB_CONN_SR_USER=svc_jwt
export DB_CONN_SR_PASS=eyJhbGciOi...starrocks-token...
export DB_CONN_SR_AUTH_TYPE=jwt
```

**Single-connection variant** (one connection per process) drops the `DB_CONN_<NAME>_` prefix and uses `DB_AUTH_TYPE` plus, for Trino, `DB_HTTP_SCHEME`:

```bash
export DB_TYPE=7
export DB_HOST=trino.example.com
export DB_PORT=443
export DB_USER=analyst
export DB_PASS=eyJhbGciOi...
export DB_AUTH_TYPE=jwt
# export DB_HTTP_SCHEME=http   # Trino-only override
```

**Token fields can be Vault references** — combine `*_AUTH_TYPE=jwt` with `vault://` in `*_PASS` to keep the bearer out of the environment:

```bash
export DB_CONN_TRINO_PASS=vault://secret/trino/prod#jwt
export DB_CONN_TRINO_AUTH_TYPE=jwt
```

#### Trino with LDAP / Password Authentication (TLS)

Trino password authenticators (LDAP, file-based, …) require TLS. The explorer
passes both the scheme and the credentials to the Trino client via
`connect_args` (`trino.auth.BasicAuthentication`) — never in the SQLAlchemy
URL, where the trino dialect would silently fall back to plain HTTP for any
port other than 443. Password auth requires the `trino` extra
(`pip install jupyterlab-db-explorer[trino]`).

Via the dialog: pick **Trino**, fill in host/port (often `8443`), enter the
LDAP username and password (or a `vault://` reference). The **HTTP scheme**
selector follows the connection automatically — it switches to **https** as
soon as a password or JWT is in play, or when the port is a conventional TLS
port (`443`/`8443`). If the coordinator uses a self-signed
certificate, open **Advanced options** and set **SSL mode** to `require`
(TLS without certificate verification), or keep full verification and point
at your CA bundle with an extra connection param: `verify=/path/to/ca.pem`.

Leaving the password blank stores a password-less connection: for an https
Trino connection with a username the explorer will then prompt for the LDAP
password on first use and keep it in memory only (never on disk).

```bash
export DB_CONN_STATIN_TYPE=7
export DB_CONN_STATIN_HOST=trino.corp.example
export DB_CONN_STATIN_PORT=8443
export DB_CONN_STATIN_USER=aristide
export DB_CONN_STATIN_PASS=ldap-password           # or vault://…
export DB_CONN_STATIN_HTTP_SCHEME=https            # implied by _PASS; explicit is clearer
export DB_CONN_STATIN_SSL_MODE=require             # only for self-signed certs
```

The scheme default, in precedence order: an explicit `_HTTP_SCHEME` always
wins; otherwise the SSL mode decides (`disable` → http; `require`/`verify-ca`/
`verify-full` → https); otherwise `https` whenever a password or JWT is
configured; otherwise the Trino client decides by port (443 → https, anything
else → http), which preserves plain-HTTP no-auth dev setups.

#### Advanced Connection Options (all engines)

The connection form's **Advanced options** (also available as env vars) are
honored per dialect:

| Option            | Env field                      | Effect                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSL mode          | `_SSL_MODE` / `DB_SSL_MODE`    | libpq-style: `disable`, `allow`, `prefer` (default), `require`, `verify-ca`, `verify-full`. See mapping below.                                                                                                                                                               |
| Connect timeout   | `_TIMEOUT` / `DB_CONN_TIMEOUT` | Seconds. Trino: `request_timeout` (a per-HTTP-request connect+read deadline, so it also bounds each result-page fetch); PostgreSQL/MySQL/StarRocks: `connect_timeout`; SQL Server: login `timeout`; SQLite: lock `timeout`; Hive: thrift socket timeout, TLS transport only. |
| Extra conn params | `_OPTS` / `DB_CONN_OPTS`       | `key=value` pairs (one per line, or `;`-separated in env vars) merged into the driver's `connect_args` last — they override anything derived from the other two options.                                                                                                     |

SSL-mode mapping per engine:

- **PostgreSQL** — passed through verbatim as libpq `sslmode`.
- **Trino** — `require` → https with `verify=False` (self-signed certs);
  `verify-ca`/`verify-full` → https with full verification; `disable` → http.
  A custom CA: `verify=/path/to/ca.pem` in the extra params.
- **MySQL / StarRocks** — `disable` → `ssl_disabled`; `require` → TLS
  enforced, no certificate verification; `verify-ca` → certificate
  verification against the system trust store (or a custom CA via
  `ssl_ca=/path/to/ca.pem`); `verify-full` → the same plus hostname
  verification. Requires pymysql ≥ 1.0 (now pinned by the extras).
- **SQL Server** — `verify-ca`/`verify-full` → `Encrypt=yes` with full
  verification; `disable` → `Encrypt=no`; anything else keeps the historical
  `TrustServerCertificate=yes` (encrypted, self-signed accepted).
- **Hive (LDAP/password auth)** — `require`/`verify-ca`/`verify-full` switch
  the connection to a SASL-PLAIN-over-TLS thrift transport with the same
  semantics as MySQL above (`ssl_ca=/path/to/ca.pem` extra param for a custom
  CA). The connect timeout applies on this TLS transport. Requires
  `pyhive[hive]` ≥ 0.7 (pinned by the `[hive]` extra). Kerberos Hive does not
  support SSL modes yet — a warning is logged if one is set.
- **Oracle** — cx_Oracle has no SSL/timeout connect arguments; both live
  inside the DSN, so SSL mode and timeout are ignored (with a warning).
  **Workaround that works today**: supply a full descriptor as an extra
  connection param — it overrides the URL-built DSN:

  ```
  dsn=(DESCRIPTION=(TRANSPORT_CONNECT_TIMEOUT=5)(ADDRESS=(PROTOCOL=TCPS)(HOST=oracle.corp)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=svc)))
  ```

  `PROTOCOL=TCPS` enables TLS (the cert must be trusted by the client wallet
  or system store) and `TRANSPORT_CONNECT_TIMEOUT` is the connect timeout in
  seconds.

- **SQLite** — SSL mode does not apply; extra params and the lock timeout do.

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

You can use type codes or names: `mysql`, `pgsql`, `postgres`, `oracle`, `hive`, `hive-ldap`, `hive-kerberos`, `sqlite`, `trino`, `starrocks`, `sqlserver`, `mssql`.

#### Database Type Codes

| Code | Database      |
| ---- | ------------- |
| 1    | MySQL         |
| 2    | PostgreSQL    |
| 3    | Oracle        |
| 4    | Hive LDAP     |
| 5    | Hive Kerberos |
| 6    | SQLite        |
| 7    | Trino         |
| 8    | StarRocks     |
| 9    | SQL Server    |

#### Reset Protection

The "reset connections" action is enabled by default. To disable it (e.g. in a shared or locked-down deployment), set:

```bash
export DB_EXPLORER_ALLOW_RESET=0
```

| Variable                  | Default | Description                                                                                  |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `DB_EXPLORER_ALLOW_RESET` | `1`     | Allow the reset action. Truthy values: `1`/`true`/`yes`. Any other value disables resetting. |

#### Result Cursor Tuning

Query results are streamed through a server-side cursor and paged/cached. These optional variables tune that behaviour. All take a positive integer; an invalid or non-positive value falls back to the default.

```bash
export DB_EXPLORER_QUERY_LIMIT=100000
export DB_EXPLORER_RESULT_PAGE_SIZE=1000
export DB_EXPLORER_RESULT_TTL_SEC=600
export DB_EXPLORER_MAX_CACHED_RESULTS=16
```

| Variable                         | Default  | Description                                                                                   |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `DB_EXPLORER_QUERY_LIMIT`        | `100000` | Max rows the streaming cursor scrolls through before stopping. Bounds server memory.          |
| `DB_EXPLORER_RESULT_PAGE_SIZE`   | `1000`   | Rows fetched per page from the cursor and cached.                                             |
| `DB_EXPLORER_RESULT_TTL_SEC`     | `600`    | Seconds an idle result session stays alive before it is evicted and its DB connection closed. |
| `DB_EXPLORER_MAX_CACHED_RESULTS` | `16`     | LRU bound on the number of concurrent result sessions held in the server.                     |

#### Complete Environment Variable Reference

The full set of environment variables read by the extension:

**Multi-connection (recommended)** — `DB_CONN_<NAME>_<FIELD>`, one set per connection:

| Field suffix   | Required        | Description                                                                                         |
| -------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `_TYPE`        | yes             | Database type code (see table above).                                                               |
| `_HOST`        | usually         | Host name / address.                                                                                |
| `_PORT`        | usually         | Port number.                                                                                        |
| `_USER`        | engine-specific | Username. Optional for Trino+JWT; required for StarRocks+JWT.                                       |
| `_PASS`        | engine-specific | Password, or JWT bearer token when `_AUTH_TYPE=jwt`. Accepts `vault://`.                            |
| `_NAME`        | no              | Default database / catalog / schema.                                                                |
| `_ID`          | no              | Explicit connection id; defaults to `<NAME>` if omitted.                                            |
| `_AUTH_TYPE`   | no              | `jwt` to use a bearer token (Trino & StarRocks). Default: password auth.                            |
| `_HTTP_SCHEME` | no              | Trino only: `https`/`http`. Default: `https` with password/JWT auth, else decided by port.          |
| `_SSL_MODE`    | no              | `disable`/`allow`/`prefer`/`require`/`verify-ca`/`verify-full` (see "Advanced Connection Options"). |
| `_TIMEOUT`     | no              | Connect timeout in seconds.                                                                         |
| `_OPTS`        | no              | Extra driver connect params, `key=value` pairs separated by `;` or newlines.                        |

**Single connection (legacy)** — one connection per process:

| Variable          | Required | Description                                                                                |
| ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| `DB_TYPE`         | yes      | Database type code.                                                                        |
| `DB_HOST`         | usually  | Host name / address.                                                                       |
| `DB_PORT`         | usually  | Port number.                                                                               |
| `DB_USER`         | maybe    | Username.                                                                                  |
| `DB_PASS`         | maybe    | Password or JWT token (when `DB_AUTH_TYPE=jwt`). Accepts `vault://`.                       |
| `DB_NAME`         | no       | Default database / catalog / schema.                                                       |
| `DB_ID`           | no       | Connection id (e.g. `default`).                                                            |
| `DB_AUTH_TYPE`    | no       | `jwt` to use a bearer token. Default: password auth.                                       |
| `DB_HTTP_SCHEME`  | no       | Trino only: `https`/`http`. Default: `https` with password/JWT auth, else decided by port. |
| `DB_SSL_MODE`     | no       | SSL mode (see "Advanced Connection Options").                                              |
| `DB_CONN_TIMEOUT` | no       | Connect timeout in seconds.                                                                |
| `DB_CONN_OPTS`    | no       | Extra driver connect params (`key=value`, `;`- or newline-separated).                      |

**Other:**

| Variable                    | Default   | Description                                                                     |
| --------------------------- | --------- | ------------------------------------------------------------------------------- |
| `DB_<NAME>`                 | _(unset)_ | Base64-encoded JSON connection definition (see "Base64 JSON" above).            |
| `DB_EXPLORER_ALLOWED_TYPES` | _(unset)_ | Comma-separated list of allowed type codes or names. Unset = all types allowed. |
| `DB_EXPLORER_ALLOW_RESET`   | `1`       | Allow the reset action (`1`/`true`/`yes`); any other value disables it.         |

Vault variables (`VAULT_*`) and the result-cursor tuning variables (`DB_EXPLORER_QUERY_LIMIT`, `DB_EXPLORER_RESULT_PAGE_SIZE`, `DB_EXPLORER_RESULT_TTL_SEC`, `DB_EXPLORER_MAX_CACHED_RESULTS`) are documented in their own sections above.

### SQL Variables

You can parametrize SQL with variables using the `${name}` syntax. When a query
runs, each `${name}` is substituted server-side before execution — so it works
for the main query as well as the sort, filter, and stats overlays.

```sql
SELECT *
FROM ${schema}.orders
WHERE created >= '${start_date}'
  AND region = ${region_id}
```

A `${name}` resolves in this order:

1. A **custom variable** you define in the **Variables** tab (beside the
   connection list in the sidebar). Each variable has a name, a value, and an
   optional description. Use the **+** button to add one, and the row actions to
   edit or delete it.
2. Otherwise, a **system environment variable** of the same name from the
   Jupyter server process (e.g. `${REGION_ID}` reads `os.environ['REGION_ID']`).

If a `${name}` matches neither, the query fails with a clear error naming the
undefined variable(s). A `${...}` whose contents are not a valid identifier
(e.g. `${bad name}`) is left untouched.

Custom variables are stored in `~/.database/variables.json`.

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
