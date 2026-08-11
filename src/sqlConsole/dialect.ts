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
  // Access the raw _item_list directly so we keep the `.next` field —
  // SqlModel.get_list strips it during projection.
  const raw = (getSqlModel() as unknown as { _item_list: IDbItem[] })
    ._item_list;
  if (!raw) {
    return null;
  }
  for (const c of raw) {
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
 * or, for connections with an explicit catalog level (Trino, StarRocks,
 * PostgreSQL/SQL Server without a default database):
 *   { catalogName: { dbName: { tableName: [colName, ...] } } }
 * or, when the connection has no explicit db layer, a flat:
 *   { tableName: [colName, ...] }
 *
 * Returns {} when nothing has been loaded yet — the completer still works,
 * just without schema items. Likewise, only catalogs/schemas the user has
 * actually expanded in the tree contribute entries, since deeper levels are
 * fetched lazily.
 */
export function schemaForDbid(dbid: string): SQLNamespace {
  const sqlModel = getSqlModel();
  const conn = findConnNode(dbid);
  if (!conn || !Array.isArray(conn.next)) {
    return {};
  }
  const out: SQLNamespace = {};
  const hasCatalogLayer = conn.next.some(c => c.type === 'catalog');
  const hasDbLayer = conn.next.some(c => c.type === 'db');

  const buildDbEntry = (path: IDbItem[]): Record<string, string[]> => {
    const tables = sqlModel.get_list(path);
    const dbEntry: Record<string, string[]> = {};
    for (const tbl of tables) {
      if (tbl.type !== 'table') {
        continue;
      }
      const cols = sqlModel.get_list([
        ...path,
        { name: tbl.name, type: 'table' } as IDbItem
      ]);
      dbEntry[tbl.name] = cols.filter(c => c.type === 'col').map(c => c.name);
    }
    return dbEntry;
  };

  if (hasCatalogLayer) {
    for (const catNode of conn.next) {
      if (catNode.type !== 'catalog') {
        continue;
      }
      const catPath = [
        { name: conn.name, type: 'conn' } as IDbItem,
        { name: catNode.name, type: 'catalog' } as IDbItem
      ];
      const dbNodes = sqlModel.get_list(catPath);
      const catEntry: Record<string, unknown> = {};
      for (const dbNode of dbNodes) {
        if (dbNode.type !== 'db') {
          continue;
        }
        catEntry[dbNode.name] = buildDbEntry([
          ...catPath,
          { name: dbNode.name, type: 'db' } as IDbItem
        ]);
      }
      (out as Record<string, unknown>)[catNode.name] = catEntry;
    }
  } else if (hasDbLayer) {
    for (const dbNode of conn.next) {
      if (dbNode.type !== 'db') {
        continue;
      }
      (out as Record<string, unknown>)[dbNode.name] = buildDbEntry([
        { name: conn.name, type: 'conn' } as IDbItem,
        { name: dbNode.name, type: 'db' } as IDbItem
      ]);
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
