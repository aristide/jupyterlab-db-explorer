import {
  MSSQL,
  MySQL,
  PLSQL,
  PostgreSQL,
  SQLite,
  StandardSQL
} from '@codemirror/lang-sql';

import { ConnType, IDbItem } from '../interfaces';
import { getSqlModel } from '../model';
import { Hive, StarRocks, Trino } from '../sqlConsole/customDialects';
import { resolveDialect, schemaForDbid } from '../sqlConsole/dialect';

function seedTree(items: IDbItem[]): void {
  (getSqlModel() as unknown as { _item_list: IDbItem[] })._item_list = items;
}

function conn(name: string, code: ConnType, next?: IDbItem[]): IDbItem {
  return {
    type: 'conn',
    name,
    subtype: code,
    next: next ?? false
  };
}

describe('resolveDialect', () => {
  beforeEach(() => seedTree([]));

  it('falls back to StandardSQL / sql for empty dbid', () => {
    const d = resolveDialect('');
    expect(d.cm).toBe(StandardSQL);
    expect(d.formatter).toBe('sql');
    expect(d.connType).toBeNull();
  });

  it('falls back when dbid not in tree', () => {
    seedTree([conn('C1', ConnType.DB_PGSQL)]);
    expect(resolveDialect('NOPE').cm).toBe(StandardSQL);
  });

  it.each([
    [ConnType.DB_MYSQL, MySQL, 'mysql'],
    [ConnType.DB_PGSQL, PostgreSQL, 'postgresql'],
    [ConnType.DB_ORACLE, PLSQL, 'plsql'],
    [ConnType.DB_HIVE_LDAP, Hive, 'hive'],
    [ConnType.DB_HIVE_KERBEROS, Hive, 'hive'],
    [ConnType.DB_SQLITE, SQLite, 'sqlite'],
    [ConnType.DB_TRINO, Trino, 'trino'],
    [ConnType.DB_STARROCKS, StarRocks, 'mysql'],
    [ConnType.DB_SQLSERVER, MSSQL, 'transactsql']
  ])('maps ConnType=%i correctly', (code, cm, fmt) => {
    seedTree([conn('C1', code)]);
    const d = resolveDialect('C1');
    expect(d.cm).toBe(cm);
    expect(d.formatter).toBe(fmt);
    expect(d.connType).toBe(code);
  });

  it('accepts a string subtype (numeric in a string)', () => {
    seedTree([
      {
        type: 'conn',
        name: 'C1',
        subtype: String(ConnType.DB_PGSQL),
        next: false
      } as IDbItem
    ]);
    expect(resolveDialect('C1').cm).toBe(PostgreSQL);
  });
});

describe('schemaForDbid', () => {
  beforeEach(() => seedTree([]));

  it('returns {} when nothing loaded', () => {
    expect(schemaForDbid('')).toEqual({});
    seedTree([conn('C1', ConnType.DB_PGSQL)]);
    expect(schemaForDbid('C1')).toEqual({});
  });

  it('walks conn → db → tables → cols', () => {
    seedTree([
      conn('C1', ConnType.DB_PGSQL, [
        {
          type: 'db',
          name: 'public',
          next: [
            {
              type: 'table',
              name: 'users',
              next: [
                { type: 'col', name: 'id', next: false },
                { type: 'col', name: 'email', next: false }
              ]
            },
            { type: 'table', name: 'orders', next: false }
          ]
        }
      ])
    ]);
    const ns = schemaForDbid('C1') as Record<string, Record<string, string[]>>;
    expect(ns.public.users).toEqual(['id', 'email']);
    expect(ns.public.orders).toEqual([]);
  });

  it('handles conn → tables (no db layer)', () => {
    seedTree([
      conn('C1', ConnType.DB_SQLITE, [
        {
          type: 'table',
          name: 't1',
          next: [{ type: 'col', name: 'a', next: false }]
        }
      ])
    ]);
    const ns = schemaForDbid('C1') as Record<string, string[]>;
    expect(ns.t1).toEqual(['a']);
  });
});
