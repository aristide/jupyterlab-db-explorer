import { ConnType, IDbItem } from '../interfaces';
import { tablePreviewSql } from '../components/previewSql';

function conn(subtype: ConnType): Pick<IDbItem, 'subtype'> {
  return { subtype };
}

describe('tablePreviewSql', () => {
  it('emits a three-part Trino name when a catalog ancestor is present', () => {
    const { sql, usedb } = tablePreviewSql(
      conn(ConnType.DB_TRINO),
      'hive',
      'default',
      'events'
    );
    expect(sql).toBe('SELECT *\nFROM "hive"."default"."events" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });

  it('keeps a bare Trino schema two-part when there is no catalog ancestor', () => {
    const { sql } = tablePreviewSql(
      conn(ConnType.DB_TRINO),
      undefined,
      'default',
      'events'
    );
    expect(sql).toBe('SELECT *\nFROM "default"."events" t LIMIT 200');
  });

  it('does not split a dotted Trino schema name with no catalog ancestor', () => {
    const { sql } = tablePreviewSql(
      conn(ConnType.DB_TRINO),
      undefined,
      'weird.schema',
      'events'
    );
    expect(sql).toBe('SELECT *\nFROM "weird.schema"."events" t LIMIT 200');
  });

  it('emits a three-part T-SQL name for SQL Server with a catalog ancestor, no reconnect', () => {
    const { sql, usedb } = tablePreviewSql(
      conn(ConnType.DB_SQLSERVER),
      'salesdb',
      'dbo',
      'orders'
    );
    expect(sql).toBe('SELECT TOP 200 *\nFROM [salesdb].[dbo].[orders] t');
    expect(usedb).toBeUndefined();
  });

  it('uses TOP and schema.table for SQL Server with no catalog ancestor', () => {
    const { sql } = tablePreviewSql(
      conn(ConnType.DB_SQLSERVER),
      undefined,
      'sales',
      'orders'
    );
    expect(sql).toBe('SELECT TOP 200 *\nFROM [sales].[orders] t');
  });

  it('binds the console to the picked PostgreSQL database and targets its schema', () => {
    const { sql, usedb } = tablePreviewSql(
      conn(ConnType.DB_PGSQL),
      'appdb',
      'public',
      'users'
    );
    expect(sql).toBe('SELECT *\nFROM "public"."users" t LIMIT 200');
    expect(usedb).toBe('appdb');
  });

  it('keeps schema.table for PostgreSQL with no catalog ancestor', () => {
    const { sql, usedb } = tablePreviewSql(
      conn(ConnType.DB_PGSQL),
      undefined,
      'analytics',
      'users'
    );
    expect(sql).toBe('SELECT *\nFROM "analytics"."users" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });

  it('emits a three-part StarRocks name when a catalog ancestor is present', () => {
    const { sql, usedb } = tablePreviewSql(
      conn(ConnType.DB_STARROCKS),
      'iceberg',
      'appdb',
      'users'
    );
    expect(sql).toBe('SELECT *\nFROM `iceberg`.`appdb`.`users` t LIMIT 200');
    expect(usedb).toBeUndefined();
  });

  it('backtick-quotes MySQL and StarRocks references', () => {
    for (const t of [ConnType.DB_MYSQL, ConnType.DB_STARROCKS]) {
      const { sql } = tablePreviewSql(conn(t), undefined, 'appdb', 'users');
      expect(sql).toBe('SELECT *\nFROM `appdb`.`users` t LIMIT 200');
    }
  });

  it('backtick-quotes Hive references (double quotes are string literals in HiveQL)', () => {
    for (const t of [ConnType.DB_HIVE_LDAP, ConnType.DB_HIVE_KERBEROS]) {
      const { sql } = tablePreviewSql(conn(t), undefined, 'logs', 'raw_events');
      expect(sql).toBe('SELECT *\nFROM `logs`.`raw_events` t LIMIT 200');
    }
  });

  it('emits an unqualified name for SQLite (no schema level)', () => {
    const { sql } = tablePreviewSql(
      conn(ConnType.DB_SQLITE),
      undefined,
      '',
      'main_table'
    );
    expect(sql).toBe('SELECT *\nFROM "main_table" t LIMIT 200');
  });

  it('uses FETCH FIRST for Oracle', () => {
    const { sql } = tablePreviewSql(
      conn(ConnType.DB_ORACLE),
      undefined,
      'HR',
      'EMPLOYEES'
    );
    expect(sql).toBe(
      'SELECT *\nFROM "HR"."EMPLOYEES" t FETCH FIRST 200 ROWS ONLY'
    );
  });

  it('falls back to ANSI quoting and LIMIT when the connection is unknown', () => {
    const { sql, usedb } = tablePreviewSql(undefined, undefined, 's', 'tbl');
    expect(sql).toBe('SELECT *\nFROM "s"."tbl" t LIMIT 200');
    expect(usedb).toBeUndefined();
  });
});
