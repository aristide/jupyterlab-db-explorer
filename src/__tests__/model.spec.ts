/**
 * test model functions
 */
import { SqlModel } from '../model';
import { IDbItem } from '../interfaces';
import {
  load_tree_db_node,
  load_tree_table_node,
  load_tree_col_node
} from '../handler';

jest.mock('../handler');

// In single-connection mode, the schema tree starts at db/table level (no conn root)
const schema_tree: Array<IDbItem> = [
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
];

describe('test model', () => {
  it('test get list at root', () => {
    const m = new SqlModel();
    // Manually set the schema tree for testing
    (m as any)._schema_tree = schema_tree;
    const l1 = m.get_list([]);
    expect(l1).toEqual([
      { name: 'default', desc: 'default db', type: 'db' },
      { name: 'db1', desc: 'other db', type: 'db' }
    ]);
  });

  it('test get list at db level', () => {
    const m = new SqlModel();
    (m as any)._schema_tree = schema_tree;
    const path = [{ type: 'db', name: 'default' }] as IDbItem[];
    const l2 = m.get_list(path);
    expect(l2).toEqual([
      { name: 'AAA_ASAD_DDD_ADAF_DDD', desc: 'table1', type: 'table' },
      { name: 'BBB', desc: 'table2', type: 'table' }
    ]);
  });

  it('test refresh root', () => {
    const m = new SqlModel();
    (m as any)._schema_tree = [...schema_tree];
    m.refresh([]);
    expect(m.get_list([])).toEqual([]);
  });

  it('test refresh middle', () => {
    const m = new SqlModel();
    (m as any)._schema_tree = JSON.parse(JSON.stringify(schema_tree));
    const path = [{ type: 'db', name: 'default' }] as IDbItem[];
    expect(m.get_list(path)).toEqual([
      { name: 'AAA_ASAD_DDD_ADAF_DDD', desc: 'table1', type: 'table' },
      { name: 'BBB', desc: 'table2', type: 'table' }
    ]);
    m.refresh(path);
    expect(m.get_list(path)).toEqual([]);
  });

  it('test model load', async () => {
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

    const m = new SqlModel();
    // Load root (schemas)
    let path: IDbItem[] = [];
    await m.load_path(path);

    // Navigate into DB1
    path = [{ name: 'DB1', type: 'db' }];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'TB1', desc: 'TB1', type: 'table', subtype: 'V' }
    ]);

    // Navigate into table
    path = [
      { name: 'DB1', type: 'db' },
      { name: 'TB1', type: 'table' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([
      { name: 'COL1', desc: 'COL1', type: 'col' }
    ]);
  });

  it('test model load err', async () => {
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
    const m = new SqlModel();
    // First load root
    await m.load_path([]);
    // Then navigate
    const path: IDbItem[] = [
      { name: 'DB1', type: 'db' },
      { name: 'TB1', type: 'table' }
    ];
    await m.load_path(path);
    expect(m.get_list(path)).toEqual([]);
  });
});
