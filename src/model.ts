import { ISignal, Signal } from '@lumino/signaling';
import {
  load_tree_root,
  load_tree_db_node,
  load_tree_table_node,
  load_tree_col_node,
  set_pass,
  clear_pass,
  query,
  get_query,
  stop_query,
  get_query_page,
  get_query_stats,
  post_query_sort,
  post_query_filter,
  get_query_topn,
  get_query_histogram,
  edit_conn,
  del_conn,
  test_conn,
  get_reset_allowed
} from './handler';
import {
  IDbItem,
  IPass,
  ITreeCmdRes,
  TApiStatus,
  IQueryRes,
  ITableData,
  IPageData,
  IStatsData,
  IHistogramBin,
  IDBConn
} from './interfaces';

export type SortDirection = 'ASC' | 'DESC';

export interface ISortSpec {
  column: string;
  direction: SortDirection;
}

export interface IFilterSpec {
  column: string;
  op: 'contains' | 'equals' | 'gt' | 'lt' | 'between';
  value: any;
}

export interface ITopValue {
  value: any;
  count: number;
}

let sqlModelInst: SqlModel;

export function getSqlModel(): SqlModel {
  if (!sqlModelInst) {
    sqlModelInst = new SqlModel();
  }
  return sqlModelInst;
}

export class SqlModel {
  constructor(init?: Array<IDbItem>) {
    if (init) {
      this._item_list = init;
    }
  }

  async init(): Promise<void> {
    const res = await get_reset_allowed();
    if (res && res.status === 'OK' && res.data) {
      const data = res.data as any;
      if (data.allowed_types) {
        this._allowed_types = data.allowed_types;
      }
      this._vault_enabled = !!data.vault_enabled;
    }
  }

  get allowed_types(): string[] | null {
    return this._allowed_types;
  }

  get vault_enabled(): boolean {
    return this._vault_enabled;
  }

  refresh(path: IDbItem[]): void {
    if (path.length === 0) {
      this._item_list = [];
      return;
    }
    let cur_list = this._item_list;
    let pptr = this._item_list[0];
    for (const p of path) {
      let find = false;
      for (let i = 0; i < cur_list.length; i++) {
        if (cur_list[i].name === p.name) {
          if (cur_list[i].next === false || !('next' in cur_list[i])) {
            return;
          }
          find = true;
          pptr = cur_list[i];
          cur_list = cur_list[i].next as IDbItem[];
        }
      }
      if (!find) {
        return;
      }
    }
    pptr.next = false;
    return;
  }

  load_path = async (path: IDbItem[]): Promise<boolean> => {
    let cur_list: IDbItem[] = this._item_list;

    if (cur_list.length === 0) {
      const res = await load_tree_root();
      if (res.status === 'NEED-PASS') {
        this._need_passwd.emit(res.pass_info as IPass);
        return false;
      }
      if (res.status !== 'OK') {
        return false;
      }
      this._item_list = cur_list = res.data as IDbItem[];
    }

    let dbid = '';
    let db = '';
    let tbl = '';

    if (path.length > 0) {
      dbid = path[0].name;
    }
    if (path.length > 1) {
      if (path[1].type === 'db') {
        db = path[1].name;
        if (path.length > 2) {
          tbl = path[2].name;
        }
      } else {
        db = '';
        tbl = path[1].name;
      }
    }

    for (const p of path) {
      for (let i = 0; i < cur_list.length; i++) {
        if (cur_list[i].name === p.name) {
          if (cur_list[i].next === false || !('next' in cur_list[i])) {
            let res!: ITreeCmdRes;
            if (p.type === 'conn') {
              res = await load_tree_db_node(dbid);
            }
            if (p.type === 'db') {
              res = await load_tree_table_node(dbid, db);
            }
            if (p.type === 'table') {
              res = await load_tree_col_node(dbid, db, tbl);
            }
            if (res.status === 'NEED-PASS') {
              cur_list[i].next = false;
              this._need_passwd.emit(res.pass_info as IPass);
              return false;
            }
            if (res.status !== 'OK') {
              cur_list[i].next = false;
              return false;
            }
            cur_list[i].next = res.data;
          }
          cur_list = cur_list[i].next as IDbItem[];
        }
      }
    }
    return true;
  };

  get_list(path: IDbItem[]): IDbItem[] {
    let cur_list: IDbItem[] = this._item_list;
    if (!cur_list) {
      return [];
    }
    for (const p of path) {
      let find = false;
      for (let i = 0; i < cur_list.length; i++) {
        if (cur_list[i].name === p.name) {
          if (cur_list[i].next === false) {
            return [];
          }
          find = true;
          cur_list = cur_list[i].next as IDbItem[];
          if (!cur_list) {
            return [];
          }
        }
      }
      if (!find) {
        return [];
      }
    }
    return cur_list.map(
      ({ name, desc, type, subtype, fix }) =>
        ({ name, desc, type, subtype, fix }) as IDbItem
    );
  }

  add_conn = async (conn: IDBConn): Promise<void> => {
    const rc = await edit_conn(conn);
    if (rc.status === 'OK') {
      const { name, db_id } = conn;
      this._item_list.push({
        type: 'conn',
        name: db_id,
        desc: name,
        subtype: parseInt(conn.db_type),
        next: false
      });
      this.conn_changed.emit(conn.db_id);
    } else {
      conn.errmsg = rc.message || '';
      this.create_conn.emit(conn);
    }
  };

  del_conn = async (dbid: string): Promise<void> => {
    const rc = await del_conn(dbid);
    if (rc.status === 'OK') {
      const idx = this._item_list.findIndex(o => o.name === dbid);
      if (idx >= 0) {
        this._item_list.splice(idx, 1);
      }
      this.conn_changed.emit(dbid);
    }
  };

  test_conn = async (conn: IDBConn): Promise<IDBConn> => {
    const rc = await test_conn(conn);
    if (rc.status === 'OK') {
      conn.errmsg = '';
      return conn;
    } else {
      conn.errmsg = rc.message || 'connection failed';
      return conn;
    }
  };

  set_pass = async (pass_info: IPass): Promise<void> => {
    const rc = await set_pass(pass_info);
    if (rc.status === 'OK') {
      this.passwd_settled.emit(pass_info.db_id);
    } else {
      this.need_passwd.emit(pass_info);
    }
  };

  clear_pass = async (dbid?: string): Promise<void> => {
    await clear_pass(dbid);
  };

  get need_passwd(): Signal<SqlModel, IPass> {
    return this._need_passwd;
  }

  get passwd_settled(): Signal<SqlModel, string> {
    return this._passwd_settled;
  }

  get conn_changed(): Signal<SqlModel, string> {
    return this._conn_changed;
  }

  get create_conn(): Signal<SqlModel, IDBConn> {
    return this._conn_create;
  }

  private _item_list: IDbItem[] = [];
  private _allowed_types: string[] | null = null;
  private _vault_enabled = false;
  private _need_passwd = new Signal<SqlModel, IPass>(this);
  private _passwd_settled = new Signal<SqlModel, string>(this);
  private _conn_changed = new Signal<SqlModel, string>(this);
  private _conn_create = new Signal<SqlModel, IDBConn>(this);
}

/**
 * model for stop query info
 */

export interface IQueryStatus {
  status: TApiStatus;
  errmsg?: string;
}

export interface IQueryModel {
  dbid: string;
  schema?: string;
  query: (sql: string) => Promise<IQueryRes>;
  /** Fetch a page of rows from the most-recently-completed query's cached
   *  cursor. Resolves with null if the task has been evicted or the cursor
   *  has not been opened. */
  fetchPage: (offset: number, limit: number) => Promise<IPageData | null>;
  /** Refresh the running per-column statistics snapshot. */
  fetchStats: () => Promise<IStatsData | null>;
  /** Apply a sort overlay (or pass null to clear). Backend reopens the
   *  cursor with ORDER BY and returns fresh metadata + first page. */
  setSort: (
    column: string | null,
    direction?: SortDirection
  ) => Promise<ITableData | null>;
  /** Replace the active filter set wholesale and reopen the cursor. */
  setFilter: (filters: IFilterSpec[]) => Promise<ITableData | null>;
  /** Independent aggregation query — top-N value counts for one column. */
  topN: (column: string, n?: number) => Promise<ITopValue[]>;
  /** Independent aggregation query — numeric value histogram for a column. */
  histogram: (column: string, n_bins?: number) => Promise<IHistogramBin[]>;
  conns: Array<string>;
  isConnReadOnly: boolean;
  stop: () => void;
  query_begin: ISignal<IQueryModel, void>;
  query_finish: ISignal<IQueryModel, IQueryStatus>;
}

export interface IQueryModelOptions {
  dbid?: string;
  schema?: string;
  conn_readonly?: boolean;
}

export class QueryModel implements IQueryModel {
  constructor(options: IQueryModelOptions) {
    this._dbid = options.dbid || '';
    this._schema = options.schema;
    this._conn_readonly = !!options.conn_readonly;
    this._running = false;
  }

  async query(sql: string): Promise<IQueryRes> {
    if (this._running) {
      return { status: 'ERR', message: 'has running' };
    }
    if (!this._dbid) {
      const st: IQueryStatus = {
        status: 'ERR',
        errmsg: 'please select the db connection first!'
      };
      this._query_finish.emit(st);
      return { status: 'ERR' };
    }
    this._running = true;
    this._controller = new AbortController();
    this._query_begin.emit();
    const options = { signal: this._controller.signal };
    let rc = await query(sql, this.dbid, this.schema, options);
    if (rc.status === 'NEED-PASS') {
      getSqlModel().need_passwd.emit(rc.pass_info as IPass);
      this._running = false;
      const st: IQueryStatus = {
        status: rc.status,
        errmsg: 'please input passwd and try again'
      };
      this._query_finish.emit(st);
      return rc;
    }
    while (rc.status === 'RETRY') {
      ((this._taskid = rc.data as string),
        (rc = await get_query(this._taskid, options)));
    }
    const st: IQueryStatus = { status: rc.status, errmsg: rc.message };
    this._query_finish.emit(st);
    this._running = false;
    return rc;
  }

  get conns(): Array<string> {
    const model = getSqlModel();
    return model.get_list([]).map(o => o.name);
  }

  stop = (): void => {
    this._controller.abort();
    stop_query(this._taskid);
  };

  /** Public accessor used by the LazyTableModel to identify which result it
   *  is currently displaying. Empty string when no query has completed yet. */
  get taskid(): string {
    return this._taskid || '';
  }

  async fetchPage(offset: number, limit: number): Promise<IPageData | null> {
    if (!this._taskid) {
      return null;
    }
    const rc = await get_query_page(this._taskid, offset, limit);
    if (rc.status !== 'OK' || !rc.data) {
      return null;
    }
    return rc.data;
  }

  async fetchStats(): Promise<IStatsData | null> {
    if (!this._taskid) {
      return null;
    }
    const rc = await get_query_stats(this._taskid);
    if (rc.status !== 'OK' || !rc.data) {
      return null;
    }
    return rc.data;
  }

  async setSort(
    column: string | null,
    direction: SortDirection = 'ASC'
  ): Promise<ITableData | null> {
    if (!this._taskid) {
      return null;
    }
    const rc = await post_query_sort(this._taskid, column, direction);
    if (rc.status !== 'OK' || !rc.data) {
      return null;
    }
    return rc.data as ITableData;
  }

  async setFilter(filters: IFilterSpec[]): Promise<ITableData | null> {
    if (!this._taskid) {
      return null;
    }
    const rc = await post_query_filter(this._taskid, filters);
    if (rc.status !== 'OK' || !rc.data) {
      return null;
    }
    return rc.data as ITableData;
  }

  async topN(column: string, n = 10): Promise<ITopValue[]> {
    if (!this._taskid) {
      return [];
    }
    const rc = await get_query_topn(this._taskid, column, n);
    if (rc.status !== 'OK' || !rc.data) {
      return [];
    }
    return rc.data.values || [];
  }

  async histogram(column: string, n_bins = 10): Promise<IHistogramBin[]> {
    if (!this._taskid) {
      return [];
    }
    const rc = await get_query_histogram(this._taskid, column, n_bins);
    if (rc.status !== 'OK' || !rc.data) {
      return [];
    }
    return rc.data.bins || [];
  }

  get dbid(): string {
    return this._dbid;
  }

  set dbid(dbid: string) {
    if (this._conn_readonly || this._running) {
      return;
    }
    this._dbid = dbid;
    getSqlModel().conn_changed.emit(dbid);
  }

  get schema(): string | undefined {
    return this._schema;
  }

  get query_begin(): ISignal<IQueryModel, void> {
    return this._query_begin;
  }

  get query_finish(): ISignal<IQueryModel, IQueryStatus> {
    return this._query_finish;
  }

  get isConnReadOnly(): boolean {
    return this._conn_readonly;
  }

  private _running: boolean;
  private _dbid: string;
  private _schema?: string;
  private _taskid!: string;

  private _query_begin = new Signal<IQueryModel, void>(this);
  private _query_finish = new Signal<IQueryModel, IQueryStatus>(this);
  private _controller!: AbortController;

  private _conn_readonly: boolean;
}
