import {
  MSSQL,
  MySQL,
  PLSQL,
  PostgreSQL,
  SQLDialect,
  SQLite,
  StandardSQL,
  type SQLNamespace
} from '@codemirror/lang-sql';

import { ConnType, IDbItem } from '../interfaces';
import { getSqlModel } from '../model';
import { Hive, StarRocks, Trino } from './customDialects';

export type FormatterLang =
  | 'sql'
  | 'mysql'
  | 'postgresql'
  | 'plsql'
  | 'sqlite'
  | 'hive'
  | 'trino'
  | 'transactsql';

export interface IResolvedDialect {
  connType: ConnType | null;
  cm: SQLDialect;
  formatter: FormatterLang;
}

const FALLBACK: IResolvedDialect = {
  connType: null,
  cm: StandardSQL,
  formatter: 'sql'
};

const TABLE: Record<number, { cm: SQLDialect; formatter: FormatterLang }> = {
  [ConnType.DB_MYSQL]: { cm: MySQL, formatter: 'mysql' },
  [ConnType.DB_PGSQL]: { cm: PostgreSQL, formatter: 'postgresql' },
  [ConnType.DB_ORACLE]: { cm: PLSQL, formatter: 'plsql' },
  [ConnType.DB_HIVE_LDAP]: { cm: Hive, formatter: 'hive' },
  [ConnType.DB_HIVE_KERBEROS]: { cm: Hive, formatter: 'hive' },
  [ConnType.DB_SQLITE]: { cm: SQLite, formatter: 'sqlite' },
  [ConnType.DB_TRINO]: { cm: Trino, formatter: 'trino' },
  [ConnType.DB_STARROCKS]: { cm: StarRocks, formatter: 'mysql' },
  [ConnType.DB_SQLSERVER]: { cm: MSSQL, formatter: 'transactsql' }
};

function findConnNode(dbid: string): IDbItem | null {
  if (!dbid) {
    return null;
  }
  const conns = getSqlModel().get_list([]);
  for (const c of conns) {
    if (c.type === 'conn' && c.name === dbid) {
      return c;
    }
  }
  return null;
}

export function resolveDialect(dbid: string): IResolvedDialect {
  const node = findConnNode(dbid);
  if (!node || node.subtype === undefined) {
    return FALLBACK;
  }
  const code =
    typeof node.subtype === 'string'
      ? parseInt(node.subtype, 10)
      : node.subtype;
  const entry = TABLE[code];
  if (!entry) {
    return FALLBACK;
  }
  return { connType: code as ConnType, ...entry };
}

/**
 * Build the namespace `schemaCompletionSource` expects, from whatever portion
 * of the SqlModel tree has been loaded for this connection. Shape:
 *   { dbName: { tableName: [colName, ...] } }
 * or, when the connection has no explicit db layer, a flat:
 *   { tableName: [colName, ...] }
 *
 * Returns {} when nothing has been loaded yet — the completer still works,
 * just without schema items.
 */
export function schemaForDbid(dbid: string): SQLNamespace {
  const sqlModel = getSqlModel();
  const conn = findConnNode(dbid);
  if (!conn || !Array.isArray(conn.next)) {
    return {};
  }
  const out: SQLNamespace = {};
  const hasDbLayer = conn.next.some(c => c.type === 'db');

  if (hasDbLayer) {
    for (const dbNode of conn.next) {
      if (dbNode.type !== 'db') {
        continue;
      }
      const tables = sqlModel.get_list([
        { name: conn.name, type: 'conn' } as IDbItem,
        { name: dbNode.name, type: 'db' } as IDbItem
      ]);
      const dbEntry: Record<string, string[]> = {};
      for (const tbl of tables) {
        if (tbl.type !== 'table') {
          continue;
        }
        const cols = sqlModel.get_list([
          { name: conn.name, type: 'conn' } as IDbItem,
          { name: dbNode.name, type: 'db' } as IDbItem,
          { name: tbl.name, type: 'table' } as IDbItem
        ]);
        dbEntry[tbl.name] = cols.filter(c => c.type === 'col').map(c => c.name);
      }
      (out as Record<string, unknown>)[dbNode.name] = dbEntry;
    }
  } else {
    for (const tbl of conn.next) {
      if (tbl.type !== 'table') {
        continue;
      }
      const cols = sqlModel.get_list([
        { name: conn.name, type: 'conn' } as IDbItem,
        { name: tbl.name, type: 'table' } as IDbItem
      ]);
      (out as Record<string, unknown>)[tbl.name] = cols
        .filter(c => c.type === 'col')
        .map(c => c.name);
    }
  }
  return out;
}
