# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 0.5.4

Follow-up to the 0.5.3 Trino fix: an audit of every supported engine for the same class of bug — the table preview / "Open Sql Console" statement being generated with the wrong qualification, quoting, or row-limit syntax for that engine's SQL.

- **SQL Server: fix table preview for connections without a default database.** The tree lists databases (drilling into each one's `dbo` schema), but the preview emitted `[dbname].[table]`, which T-SQL resolves as *schema*.table inside `master`. It now emits a native three-part name — `[dbname].[dbo].[table]`.
- **SQL Server: use `TOP` instead of `LIMIT`.** The preview statement ended in `LIMIT 200`, which is not T-SQL and made every SQL Server preview a syntax error; it is now `SELECT TOP 200 *`. Oracle likewise gets `FETCH FIRST 200 ROWS ONLY` instead of `LIMIT`.
- **PostgreSQL: fix table preview for connections without a default database.** The tree lists databases (drilling into each one's `public` schema), but the preview emitted `"dbname"."table"` against the `postgres` maintenance session — and PostgreSQL has no cross-database references, so no qualification could ever work. The console opened from such a table is now pinned to the picked database (a new optional `db` on `POST /query`, threaded to the already-supported `usedb` of the query task) and previews `"public"."table"`. Pinned consoles get their own widget and a `conn · database` title so SQL for one database is never appended into a console connected to another.
- **Hive: quote identifiers with backticks.** The preview used double quotes, which are string literals in HiveQL — `SELECT * FROM "db"."table"` was a parse error. Both Hive LDAP and Kerberos connections now emit `` `db`.`table` ``.
- **Fix empty column lists under no-default-database PostgreSQL/SQL Server connections.** `get_column_info` queried `information_schema.columns` of the maintenance/`master` session instead of the picked database (both engines keep a per-database `information_schema`), so expanding a table showed no columns. The lookup now reconnects to the picked database, mirroring what the table listing already did.
- Connections now expose a `has_db` flag (whether a default database/catalog is pinned) so the frontend can tell "first tree level is databases" from "first tree level is schemas" instead of guessing from label shape; the Trino `catalog.schema` split is additionally gated on it, so a dotted schema name under a pinned catalog is no longer mis-split.
- The preview builder moved to `src/components/previewSql.ts` with unit coverage for every engine.

Not affected (checked): MySQL/StarRocks (`` `db`.`table` `` is valid cross-database, `information_schema` is server-wide), SQLite (no schema level), Trino (fixed in 0.5.3). Known gaps left as-is: StarRocks external catalogs are not browsable (tree lists only the current catalog's databases), and Oracle tree browsing still relies on `show databases`, which Oracle does not support.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.5.3

- **Fix Trino table preview / "Open Sql Console" returning no data when the connection has no default catalog.** Previewing or opening a console for a table generated `SELECT * FROM "catalog.schema"."table" t LIMIT 200`, quoting the combined `catalog.schema` tree label as a single identifier — an unresolvable 2-part Trino name with no catalog (`MISSING_CATALOG_NAME` / `GENERIC_INTERNAL_ERROR`, so the grid came back empty). The table console now emits a proper three-part `"catalog"."schema"."table"` reference for Trino nodes whose label carries a catalog, splitting on the first dot to mirror the backend drill-down (`db.py`, `schema.split('.', 1)`). Connections that set a default catalog (the schema node is a bare name) are unchanged. This makes click-to-query work in browse-all-catalogs setups where no per-connection default catalog is configured.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.5.2

- **Hive over TLS (LDAP/password auth).** SSL modes `require`/`verify-ca`/`verify-full` now build a SASL-PLAIN-over-`TSSLSocket` thrift transport (pyhive has no SSL parameters and its `thrift_transport` argument conflicts with the SQLAlchemy dialect's kwargs, so the engine is created with a `creator` that builds a fresh transport per pooled connection). Certificate semantics match the other engines: `require` = TLS without verification, `verify-ca` = system trust store or `ssl_ca=/path` extra param, `verify-full` = plus hostname verification. The connect timeout applies as the thrift socket timeout on this transport. Requires `pyhive[hive]>=0.7` (extra bumped).
- **No more silently ignored options.** Oracle (SSL mode + timeout), Kerberos Hive (SSL mode + timeout), and plain-transport Hive (timeout) now log an explicit warning when an advanced option is set that the driver cannot honor.
- **Oracle TLS documented.** A full `dsn=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)...))` descriptor in Extra connection params overrides the URL-built DSN (connect_args win the merge), enabling Oracle over TLS and descriptor-level connect timeouts today — recipe added to the README.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.5.1

- **Fix Trino LDAP/password connections over TLS.** The password path built the SQLAlchemy URL with the credentials embedded and no `connect_args`; the trino dialect ignores `http_scheme` in the URL query and picks plain HTTP for any port other than 443, so metadata reflection sent cleartext HTTP to TLS-only coordinators and failed with a TLS alert ("load failed"). Credentials now go through `trino.auth.BasicAuthentication` and the scheme through `connect_args`, mirroring the JWT path. Default scheme with a password or JWT is `https`; credential-less connections keep the client's port-based default.
- Show the Trino **HTTP scheme** selector for all auth methods (it was JWT-only) and default it dynamically: https once a password/JWT is entered or when the port is 443/8443, http otherwise.
- Wire the Advanced options through `engine.py` — they were captured by the form but ignored:
  - **SSL mode** (libpq vocabulary) mapped per dialect: PostgreSQL `sslmode` passthrough; Trino `require` → `verify=False` for self-signed certs; MySQL/StarRocks `ssl_disabled` / a truthy `ssl` dict for `require` (pymysql treats an empty dict as "no TLS") and a real `ssl.SSLContext` for `verify-ca`/`verify-full` so hostname verification actually works against the system trust store (pymysql ≥ 1.0, now pinned by the extras); SQL Server `Encrypt`/`TrustServerCertificate`.
  - **Connect timeout** → `request_timeout` (Trino), `connect_timeout` (PostgreSQL/MySQL/StarRocks), login `timeout` (SQL Server), lock `timeout` (SQLite).
  - **Extra connection params** (`key=value` lines) merged into the driver `connect_args` last, so they can override any derived value (e.g. `verify=/path/to/ca.pem` for a custom Trino CA).
  - The values are also persisted/emitted even when the Advanced disclosure is collapsed, and re-loaded when editing a connection.
- New environment fields for the same options: `DB_CONN_<NAME>_SSL_MODE` / `_TIMEOUT` / `_OPTS` and single-connection `DB_SSL_MODE` / `DB_CONN_TIMEOUT` / `DB_CONN_OPTS`.
- Trino password prompt flow: an https Trino connection with a username and no stored password now prompts for the password (kept in memory only), like other engines. Credential-less http connections are untouched.
- Fix the stored-username + prompted-password flow for all engines: the prompt's password is now actually used (previously an empty password was sent) and `input_passwd` — referenced but never defined — no longer raises `NameError` on credential-less engine access.
- Trino usernames are URL-quoted in the SQLAlchemy URL and passed raw via `connect_args['user']`, so LDAP identities like `user@corp.com` or `dev+ops@corp.com` survive the trino dialect's double URL-decoding.
- A Trino connection that sends a password over explicitly-chosen plain http logs a cleartext-credentials warning.
- Extra-connection-param values coerce only `true`/`false` to booleans — ODBC-style `yes`/`no`/`on`/`off` stay strings (e.g. `MultiSubnetFailover=yes` reaches the driver verbatim) — and malformed entries are no longer echoed into the server log (a `;` inside a secret-bearing value used to leak fragments of it).
- Changing SSL mode / timeout / extra params now invalidates a previous "Connection successful" test badge, and SQLite connections no longer submit invisible stale Advanced values (its UI hides that section).
- `DB_EXPLORER_*` tuning variables (e.g. `DB_EXPLORER_QUERY_LIMIT`) are excluded from the base64 connection scan as a prefix — previously each one showed up as a phantom connection that crashed the connection list.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.4.0

- Add dialect-aware SQL autocomplete to the SQL Console editor. Keywords and built-in functions are picked from the active connection's dialect via `@codemirror/lang-sql`; PostgreSQL, MySQL, Oracle, SQLite, and SQL Server use the library's built-in dialects, while Trino, Hive, and StarRocks ship custom `SQLDialect.define(...)` definitions sourced from each engine's documentation.
- Pull table and column names from the already-loaded `SqlModel` tree so completions are instant and dialect-correct after the user has expanded a connection.
- Add a Format SQL toolbar button and `Shift+Alt+F` shortcut backed by `sql-formatter`, with the dialect mapped from the same `ConnType` table. The `-- conn: <dbid>` magic header on line 0 is preserved across reflow.
- Show explanations, signatures, and examples in a side-panel tooltip when arrowing over a completion. The reference registry covers generic SQL, PostgreSQL, MySQL, SQLite, SQL Server, and Oracle, with extra-deep coverage for Trino (UNNEST, lambda array ops, APPROX_PERCENTILE, JSON helpers, window functions) and StarRocks (full bitmap + HLL family, WINDOW_FUNNEL / RETENTION, DUPLICATE / AGGREGATE / UNIQUE KEY DDL, MATERIALIZED VIEW, BROKER / ROUTINE LOAD).
- Ten generic snippets (`selw`, `selj`, `sela`, `selg`, `ins`, `upd`, `del`, `cte`, `cas`, `crt`) expand to multi-line templates with tab stops.
- Update the GitHub Actions Build workflow to reference the correct `jupyterlab_db_explorer` package name everywhere (template leftover from `jupyterlab-env-sync`), add a separate server-extension pytest step, ANSI-strip extension-list grep checks, and run integration tests in parallel with the isolated-install check.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.3.0

- Add Microsoft SQL Server as a supported database (pyodbc + ODBC Driver 18, default port 1433). Tree view, connection form, and `engine.py` schema/table/column metadata mirror the PostgreSQL flow — connect to `master` when no default DB is set, list user databases or schemas accordingly.
- Replace the breadcrumb step-by-step navigation with a DBeaver-style scrollable tree that lazy-loads children, supports synthetic Databases / Tables / Views group nodes, and filters with ancestor auto-expand.
- Adopt the Data4Now design system for the database tree and new-connection form: brand-logo connection swatches, segmented credential picker, rich test-result strip, collapsible Advanced options block, hover-action mini buttons, footer breadcrumb with per-connection counts.
- Ship the d4n design as a project-level skill at `.claude/skills/data4now-design/` for future UI work.
- Harmonize per-engine optional-database flow so MySQL, Hive, Trino, StarRocks, and PostgreSQL connections can be saved without a default database name.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.2.1

- Earlier releases.
