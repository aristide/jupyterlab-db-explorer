# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

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
