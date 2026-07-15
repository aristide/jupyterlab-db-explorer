import { ConnType, IDbItem } from '../interfaces';

export interface ITablePreview {
  /** The ready-to-run preview statement. */
  sql: string;
  /** Database the console session must connect to instead of the
   *  connection's default (PostgreSQL picked-database flow — PG has no
   *  cross-database references, so qualification alone cannot work). */
  usedb?: string;
}

/**
 * Build the `SELECT` preview for a table node of the explorer tree.
 *
 * `schema` is the label of the tree node the table sits under, and what it
 * denotes depends on the connection:
 * - a schema, for connections that pin a default database (`has_db`);
 * - a database (PostgreSQL / SQL Server without a default database) — the
 *   tree listed databases and drilled into `public` / `dbo` respectively;
 * - a combined `catalog.schema` label (Trino without a default catalog).
 *
 * The reference must be qualified accordingly — quoting the raw label as a
 * single identifier resolves against the wrong namespace (or nothing at
 * all), which is how the Trino/PG/SQL Server previews used to come back
 * empty. Quote style and row-limit syntax are per-dialect: backticks for the
 * MySQL family and Hive (double quotes are string literals in HiveQL),
 * brackets and `TOP` for T-SQL, `FETCH FIRST` for Oracle.
 */
export function tablePreviewSql(
  conn: Pick<IDbItem, 'subtype' | 'has_db'> | undefined,
  schema: string,
  table: string
): ITablePreview {
  const subtype = conn?.subtype;
  let qOpen = '"';
  let qClose = '"';
  if (
    subtype === ConnType.DB_MYSQL ||
    subtype === ConnType.DB_STARROCKS ||
    subtype === ConnType.DB_HIVE_LDAP ||
    subtype === ConnType.DB_HIVE_KERBEROS
  ) {
    qOpen = qClose = '`';
  } else if (subtype === ConnType.DB_SQLSERVER) {
    qOpen = '[';
    qClose = ']';
  }

  const idents: string[] = [];
  let usedb: string | undefined;
  if (subtype === ConnType.DB_TRINO && !conn?.has_db && schema.includes('.')) {
    // No default catalog: the label is `catalog.schema`; split on the first
    // dot, mirroring the backend drill-down (db.py, schema.split('.', 1)).
    const dot = schema.indexOf('.');
    idents.push(schema.slice(0, dot), schema.slice(dot + 1));
  } else if (
    subtype === ConnType.DB_SQLSERVER &&
    conn &&
    !conn.has_db &&
    schema
  ) {
    // No default database: the label is a database whose dbo tables the
    // tree listed; T-SQL resolves three-part names from any session.
    idents.push(schema, 'dbo');
  } else if (subtype === ConnType.DB_PGSQL && conn && !conn.has_db && schema) {
    // No default database: the label is a database, but PostgreSQL cannot
    // reference another database's tables — the console has to connect to
    // it, and the table lives in its `public` schema.
    usedb = schema;
    idents.push('public');
  } else if (schema) {
    idents.push(schema);
  }
  idents.push(table);
  const fq = idents.map(id => `${qOpen}${id}${qClose}`).join('.');

  let sql: string;
  if (subtype === ConnType.DB_SQLSERVER) {
    sql = `SELECT TOP 200 *\nFROM ${fq} t`;
  } else if (subtype === ConnType.DB_ORACLE) {
    sql = `SELECT *\nFROM ${fq} t FETCH FIRST 200 ROWS ONLY`;
  } else {
    sql = `SELECT *\nFROM ${fq} t LIMIT 200`;
  }
  return { sql, usedb };
}
