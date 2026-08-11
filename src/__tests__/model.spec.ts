/**
 * test model functions
 */
import { SqlModel } from '../model';
import { IDbItem } from '../interfaces';
import {
  load_tree_root,
  load_tree_db_node,
  load_tree_table_node,
  load_tree_col_node
} from '../handler';

jest.mock('../handler');

const tree: Array<IDbItem> = [
  {
    type: 'conn',
    name: 'CONN1',
    desc: 'CONN1',
    next: [
      {
        type: 'db',
        name: 'default',
        desc: 'default db',
        next: [
          {
            type: 'table',
            name: 'AAA_ASAD_DDD_ADAF_DDD',
            desc: 'table1',
            next: [
              { type: 'col', name: 'COL2', desc: 'col2', next: false },
              { type: 'col', name: 'COL1', desc: 'col1', next: false }
            ]
          },
          { type: 'table', name: 'BBB', desc: 'table2', next: false }
        ]
      },
      {
        type: 'db',
        name: 'db1',
        desc: 'other db',
        next: [
          { type: 'table', name: 'AAA', desc: 'table1', next: false },
          { type: 'table', name: 'BBB', desc: 'table2', next: false }
        ]
      }
    ]
  }
];

describe('test model', () => {
  it('test get list', () => {
    let m = new SqlModel(tree);
    const l1 = m.get_list([]);
    expect(l1).toEqual([{ name: 'CONN1', desc: 'CONN1', type: 'conn' }]);
    const l2 = m.get_list([l1[0]]);
    expect(l2).toEqual([
      { name: 'default', desc: 'default db', type: 'db' },
      { name: 'db1', desc: 'other db', type: 'db' }
    ]);
  });

  it('test refresh root', () => {
    let m = new SqlModel(tree);
    m.refresh([]);
    expect(m.get_list([])).toEqual([]);
  });

  it('test refresh middle', () => {
    let m = new SqlModel(tree);
    const path = [
      { type: 'conn', name: 'CONN1' },
      { type: 'db', name: 'default' }
    ];
    expect(m.get_list(path)).toEqual([
      { name: 'AAA_ASAD_DDD_ADAF_DDD', desc: 'table1', type: 'table' },
      { name: 'BBB', desc: 'table2', type: 'table' }
    ]);
    m.refresh(path);
    expect(m.get_list(path)).toEqual([]);
  });

  it('test model load', async () => {
    (load_tree_root as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'CONN1', desc: 'CONN1', type: 'conn' }]
    });
    (load_tree_db_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'DB1', desc: 'DB1', type: 'db' }]
    });
    (load_tree_table_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'TB1', desc: 'TB1', type: 'table', subtype: 'V' }]
    });
    (load_tree_col_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'COL1', desc: 'COL1', type: 'col' }]
    });

    let m = new SqlModel();
    let path: IDbItem[] = [
      { name: 'CONN1', type: 'conn' },
      { name: 'DB1', type: 'db' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'TB1', desc: 'TB1', type: 'table', subtype: 'V' }
    ]);

    path = [
      { name: 'CONN1', type: 'conn' },
      { name: 'DB1', type: 'db' },
      { name: 'TB1', type: 'table' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'COL1', desc: 'COL1', type: 'col' }
    ]);
  });

  it('test model load with a catalog level (conn -> catalog -> db -> table -> col)', async () => {
    (load_tree_root as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'CONN1', desc: 'CONN1', type: 'conn' }]
    });
    (load_tree_db_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'CAT1', desc: 'CAT1', type: 'catalog' }]
    });
    (load_tree_table_node as jest.Mock).mockImplementation(
      (_dbid: string, db: string) => {
        if (db === 'CAT1') {
          // Fetching a catalog's schemas — reuses the same call as
          // fetching a schema's tables, disambiguated by the qualifier.
          return Promise.resolve({
            status: 'OK',
            data: [{ name: 'DB1', desc: 'DB1', type: 'db' }]
          });
        }
        if (db === 'CAT1.DB1') {
          return Promise.resolve({
            status: 'OK',
            data: [{ name: 'TB1', desc: 'TB1', type: 'table', subtype: 'V' }]
          });
        }
        throw new Error(`unexpected db param: ${db}`);
      }
    );
    (load_tree_col_node as jest.Mock).mockImplementation(
      (_dbid: string, db: string, tbl: string) => {
        expect(db).toBe('CAT1.DB1');
        expect(tbl).toBe('TB1');
        return Promise.resolve({
          status: 'OK',
          data: [{ name: 'COL1', desc: 'COL1', type: 'col' }]
        });
      }
    );

    const m = new SqlModel();
    let path: IDbItem[] = [
      { name: 'CONN1', type: 'conn' },
      { name: 'CAT1', type: 'catalog' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'DB1', desc: 'DB1', type: 'db' }
    ]);

    path = [
      { name: 'CONN1', type: 'conn' },
      { name: 'CAT1', type: 'catalog' },
      { name: 'DB1', type: 'db' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'TB1', desc: 'TB1', type: 'table', subtype: 'V' }
    ]);

    path = [
      { name: 'CONN1', type: 'conn' },
      { name: 'CAT1', type: 'catalog' },
      { name: 'DB1', type: 'db' },
      { name: 'TB1', type: 'table' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'COL1', desc: 'COL1', type: 'col' }
    ]);
  });

  it('test model load err', async () => {
    (load_tree_root as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'CONN1', desc: 'CONN1', type: 'conn' }]
    });
    (load_tree_db_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'DB1', desc: 'DB1', type: 'db' }]
    });
    (load_tree_table_node as jest.Mock).mockReturnValue({
      status: 'OK',
      data: [{ name: 'TB1', desc: 'TB1', type: 'table' }]
    });
    (load_tree_col_node as jest.Mock).mockReturnValue({
      status: 'ERR',
      data: [{ name: 'COL1', desc: 'COL1', type: 'col' }]
    });
    let m = new SqlModel();
    const path: IDbItem[] = [
      { name: 'CONN1', type: 'conn' },
      { name: 'DB1', type: 'db' },
      { name: 'TB1', type: 'table' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([]);
  });
});
