import { ConnType, IDbItem } from '../interfaces';
import { tablePreviewSql } from '../components/previewSql';

function conn(subtype: ConnType, has_db: boolean): Pick<IDbItem, 'subtype' | 'has_db'> {
  return { subtype, has_db };
}

describe('tablePreviewSql', () => {
  it('splits the Trino catalog.schema label when no default catalog is set', () => {
    const { sql, usedb } = tablePreviewSql(conn(ConnType.DB_TRINO, false), 'hive.default', 'events');
    expect(sql).toBe('SELECT *\nFROM "hive"."default"."events" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });

  it('keeps a bare Trino schema two-part when a default catalog is set', () => {
    const { sql } = tablePreviewSql(conn(ConnType.DB_TRINO, true), 'default', 'events');
    expect(sql).toBe('SELECT *\nFROM "default"."events" t LIMIT 200');
  });

  it('does not split a dotted Trino schema name when a default catalog is set', () => {
    const { sql } = tablePreviewSql(conn(ConnType.DB_TRINO, true), 'weird.schema', 'events');
    expect(sql).toBe('SELECT *\nFROM "weird.schema"."events" t LIMIT 200');
  });

  it('emits a three-part T-SQL name for SQL Server without a default database', () => {
    const { sql, usedb } = tablePreviewSql(conn(ConnType.DB_SQLSERVER, false), 'salesdb', 'orders');
    expect(sql).toBe('SELECT TOP 200 *\nFROM [salesdb].[dbo].[orders] t');
    expect(usedb).toBeUndefined();
  });

  it('uses TOP and schema.table for SQL Server with a default database', () => {
    const { sql } = tablePreviewSql(conn(ConnType.DB_SQLSERVER, true), 'sales', 'orders');
    expect(sql).toBe('SELECT TOP 200 *\nFROM [sales].[orders] t');
  });

  it('binds the console to the picked PostgreSQL database and targets public', () => {
    const { sql, usedb } = tablePreviewSql(conn(ConnType.DB_PGSQL, false), 'appdb', 'users');
    expect(sql).toBe('SELECT *\nFROM "public"."users" t LIMIT 200');
    expect(usedb).toBe('appdb');
  });

  it('keeps schema.table for PostgreSQL with a default database', () => {
    const { sql, usedb } = tablePreviewSql(conn(ConnType.DB_PGSQL, true), 'analytics', 'users');
    expect(sql).toBe('SELECT *\nFROM "analytics"."users" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });

  it('backtick-quotes MySQL and StarRocks references', () => {
    for (const t of [ConnType.DB_MYSQL, ConnType.DB_STARROCKS]) {
      const { sql } = tablePreviewSql(conn(t, false), 'appdb', 'users');
      expect(sql).toBe('SELECT *\nFROM `appdb`.`users` t LIMIT 200');
    }
  });

  it('backtick-quotes Hive references (double quotes are string literals in HiveQL)', () => {
    for (const t of [ConnType.DB_HIVE_LDAP, ConnType.DB_HIVE_KERBEROS]) {
      const { sql } = tablePreviewSql(conn(t, false), 'logs', 'raw_events');
      expect(sql).toBe('SELECT *\nFROM `logs`.`raw_events` t LIMIT 200');
    }
  });

  it('emits an unqualified name for SQLite (no schema level)', () => {
    const { sql } = tablePreviewSql(conn(ConnType.DB_SQLITE, true), '', 'main_table');
    expect(sql).toBe('SELECT *\nFROM "main_table" t LIMIT 200');
  });

  it('uses FETCH FIRST for Oracle', () => {
    const { sql } = tablePreviewSql(conn(ConnType.DB_ORACLE, true), 'HR', 'EMPLOYEES');
    expect(sql).toBe('SELECT *\nFROM "HR"."EMPLOYEES" t FETCH FIRST 200 ROWS ONLY');
  });

  it('falls back to ANSI quoting and LIMIT when the connection is unknown', () => {
    const { sql, usedb } = tablePreviewSql(undefined, 's', 'tbl');
    expect(sql).toBe('SELECT *\nFROM "s"."tbl" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });
});
