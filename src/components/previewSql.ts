import { ConnType, IDbItem } from '../interfaces';

export interface ITablePreview {
  /** The ready-to-run preview statement. */
  sql: string;
  /** Database the console session must connect to instead of the
   *  connection's default (PostgreSQL/SQL Server picked-catalog flow — they
   *  have no cross-database references, so qualification alone cannot
   *  work). */
  usedb?: string;
}

/**
 * Build the `SELECT` preview for a table node of the explorer tree.
 *
 * `catalog` and `schema` are the real ancestor tree nodes the table sits
 * under — `catalog` is only present for connections with an explicit
 * catalog level (Trino, StarRocks, PostgreSQL/SQL Server without a default
 * database). Whether a catalog can be referenced in the same statement or
 * requires reconnecting depends on the engine: Trino/StarRocks are
 * federated, and T-SQL natively resolves three-part names from any session,
 * so all three just get a fully-qualified reference. PostgreSQL is the odd
 * one out — it cannot reference another database's tables from one
 * connection at all, so the console instead has to connect to it directly
 * (`usedb`) and the in-session reference is just `schema.table`.
 *
 * Quote style and row-limit syntax are per-dialect: backticks for the MySQL
 * family and Hive (double quotes are string literals in HiveQL), brackets
 * and `TOP` for T-SQL, `FETCH FIRST` for Oracle.
 */
export function tablePreviewSql(
  conn: Pick<IDbItem, 'subtype'> | undefined,
  catalog: string | undefined,
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
  if (catalog && subtype === ConnType.DB_PGSQL) {
    // PostgreSQL can't cross-reference another database from one
    // connection — the console has to connect to it directly.
    usedb = catalog;
    if (schema) {
      idents.push(schema);
    }
  } else if (catalog) {
    // Federated (Trino, StarRocks) or T-SQL's native cross-database
    // three-part name support (SQL Server) — one connection can reference
    // any catalog by fully-qualified name.
    idents.push(catalog);
    if (schema) {
      idents.push(schema);
    }
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
