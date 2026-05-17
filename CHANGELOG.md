# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 0.3.0

- Add Microsoft SQL Server as a supported database (pyodbc + ODBC Driver 18, default port 1433). Tree view, connection form, and `engine.py` schema/table/column metadata mirror the PostgreSQL flow — connect to `master` when no default DB is set, list user databases or schemas accordingly.
- Replace the breadcrumb step-by-step navigation with a DBeaver-style scrollable tree that lazy-loads children, supports synthetic Databases / Tables / Views group nodes, and filters with ancestor auto-expand.
- Adopt the Data4Now design system for the database tree and new-connection form: brand-logo connection swatches, segmented credential picker, rich test-result strip, collapsible Advanced options block, hover-action mini buttons, footer breadcrumb with per-connection counts.
- Ship the d4n design as a project-level skill at `.claude/skills/data4now-design/` for future UI work.
- Harmonize per-engine optional-database flow so MySQL, Hive, Trino, StarRocks, and PostgreSQL connections can be saved without a default database name.

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.2.1

- Earlier releases.
