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
