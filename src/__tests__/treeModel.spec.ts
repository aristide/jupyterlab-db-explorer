/**
 * Tests for treeModel.buildVisibleRows — the pure tree-flattening logic.
 *
 * The model.spec.ts file shows the convention: build a tree of IDbItem
 * literals, hand it to `new SqlModel(tree)`, and assert against the model's
 * public outputs. We do the same here, observing the rows that the tree
 * renderer would walk through.
 */
import { SqlModel } from '../model';
import { IDbItem, ConnType } from '../interfaces';
import { buildVisibleRows, pathKey } from '../components/treeModel';

function emptySets() {
  return {
    expanded: new Set<string>(),
    loading: new Set<string>(),
    errorKeys: new Set<string>()
  };
}

describe('buildVisibleRows', () => {
  const mysqlConn: IDbItem = {
    type: 'conn',
    name: 'CONN1',
    desc: 'MySQL conn',
    subtype: ConnType.DB_MYSQL,
    next: [
      {
        type: 'db',
        name: 'moviedb',
        desc: 'movies',
        next: [
          {
            type: 'table',
            name: 'actor',
            desc: 'actor table',
            subtype: 'T',
            next: false
          },
          {
            type: 'table',
            name: 'film',
            desc: 'film table',
            subtype: 'T',
            next: false
          },
          {
            type: 'table',
            name: 'film_list',
            desc: 'film view',
            subtype: 'V',
            next: false
          }
        ]
      }
    ]
  };

  const sqliteConn: IDbItem = {
    type: 'conn',
    name: 'SQLITECONN',
    desc: 'SQLite',
    subtype: ConnType.DB_SQLITE,
    next: [
      { type: 'table', name: 'users', subtype: 'T', next: false },
      { type: 'table', name: 'logs', subtype: 'T', next: false }
    ]
  };

  it('renders only root rows when nothing is expanded', () => {
    const model = new SqlModel([mysqlConn]);
    const { expanded, loading, errorKeys } = emptySets();
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('real');
    expect(rows[0].item?.name).toBe('CONN1');
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].isOpen).toBe(false);
  });

  it('inserts a synthetic Databases group under a connection whose children are dbs', () => {
    const model = new SqlModel([mysqlConn]);
    const { expanded, loading, errorKeys } = emptySets();
    expanded.add(pathKey([{ type: 'conn', name: 'CONN1' }]));
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    // [conn, Databases group] — Databases group is not expanded yet
    expect(rows.map(r => r.kind)).toEqual(['real', 'group']);
    expect(rows[1].label).toBe('Databases');
    expect(rows[1].depth).toBe(1);
  });

  it('renders Tables and Views groups under a schema, partitioning by subtype', () => {
    const model = new SqlModel([mysqlConn]);
    const { expanded, loading, errorKeys } = emptySets();
    const connItem: IDbItem = { type: 'conn', name: 'CONN1' };
    const dbItem: IDbItem = { type: 'db', name: 'moviedb' };
    expanded.add(pathKey([connItem]));
    expanded.add(pathKey([connItem], 'group:Databases'));
    expanded.add(pathKey([connItem, dbItem]));
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    // conn / Databases / moviedb / Tables / Views
    expect(rows.map(r => r.label || r.item?.name)).toEqual([
      'CONN1',
      'Databases',
      'moviedb',
      'Tables',
      'Views'
    ]);
    const tablesGroup = rows.find(r => r.label === 'Tables')!;
    const viewsGroup = rows.find(r => r.label === 'Views')!;
    expect(tablesGroup.groupSubtype).toBe('T');
    expect(viewsGroup.groupSubtype).toBe('V');
  });

  it('omits an empty Views group when only tables are present', () => {
    const onlyTables: IDbItem = {
      type: 'conn',
      name: 'C',
      subtype: ConnType.DB_MYSQL,
      next: [
        {
          type: 'db',
          name: 'd',
          next: [{ type: 'table', name: 't', subtype: 'T', next: false }]
        }
      ]
    };
    const model = new SqlModel([onlyTables]);
    const { expanded, loading, errorKeys } = emptySets();
    const connItem: IDbItem = { type: 'conn', name: 'C' };
    const dbItem: IDbItem = { type: 'db', name: 'd' };
    expanded.add(pathKey([connItem]));
    expanded.add(pathKey([connItem], 'group:Databases'));
    expanded.add(pathKey([connItem, dbItem]));
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    expect(rows.find(r => r.label === 'Views')).toBeUndefined();
    expect(rows.find(r => r.label === 'Tables')).toBeDefined();
  });

  it('renders Tables/Views directly under a SQLite-shaped conn (no Databases group)', () => {
    const model = new SqlModel([sqliteConn]);
    const { expanded, loading, errorKeys } = emptySets();
    expanded.add(pathKey([{ type: 'conn', name: 'SQLITECONN' }]));
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    // conn / Tables — no Databases group
    expect(rows.map(r => r.label || r.item?.name)).toEqual([
      'SQLITECONN',
      'Tables'
    ]);
  });

  it('renders columns flat under a table (no group wrapper)', () => {
    const tree: IDbItem[] = [
      {
        type: 'conn',
        name: 'C',
        subtype: ConnType.DB_MYSQL,
        next: [
          {
            type: 'db',
            name: 'd',
            next: [
              {
                type: 'table',
                name: 't',
                subtype: 'T',
                next: [
                  { type: 'col', name: 'id', next: false },
                  { type: 'col', name: 'name', next: false }
                ]
              }
            ]
          }
        ]
      }
    ];
    const model = new SqlModel(tree);
    const { expanded, loading, errorKeys } = emptySets();
    const conn: IDbItem = { type: 'conn', name: 'C' };
    const db: IDbItem = { type: 'db', name: 'd' };
    const table: IDbItem = { type: 'table', name: 't' };
    expanded.add(pathKey([conn]));
    expanded.add(pathKey([conn], 'group:Databases'));
    expanded.add(pathKey([conn, db]));
    expanded.add(pathKey([conn, db], 'group:Tables'));
    expanded.add(pathKey([conn, db, table]));
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    const labels = rows.map(r => r.label || r.item?.name);
    // ... t / id / name — no group between t and its columns
    const tIdx = labels.indexOf('t');
    expect(labels.slice(tIdx, tIdx + 3)).toEqual(['t', 'id', 'name']);
  });

  it('marks a row as error when its next === false (post-attempt)', () => {
    const failedTree: IDbItem[] = [
      {
        type: 'conn',
        name: 'C',
        subtype: ConnType.DB_MYSQL,
        next: false
      }
    ];
    const model = new SqlModel(failedTree);
    const { expanded, loading, errorKeys } = emptySets();
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    expect(rows[0].isError).toBe(true);
  });

  it('filter keeps matching nodes and force-opens ancestors', () => {
    const model = new SqlModel([mysqlConn]);
    const { expanded, loading, errorKeys } = emptySets();
    // Nothing in `expanded` — filter alone should auto-expand the ancestors
    // of any match.
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, 'film');
    const names = rows.map(r => r.label || r.item?.name);
    // Should reveal: CONN1 / Databases / moviedb / Tables / film / Views / film_list
    expect(names).toContain('film');
    expect(names).toContain('film_list');
    expect(names).toContain('moviedb');
    expect(names).toContain('Databases');
    // `actor` doesn't match and is hidden.
    expect(names).not.toContain('actor');
  });

  it('returns an empty list when the model has no loaded data', () => {
    const model = new SqlModel();
    const { expanded, loading, errorKeys } = emptySets();
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, '');
    expect(rows).toEqual([]);
  });
});
