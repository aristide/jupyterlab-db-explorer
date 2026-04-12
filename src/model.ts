import { ISignal, Signal } from '@lumino/signaling';
import {
  get_conn_status,
  save_conn,
  reset_conn,
  get_reset_allowed,
  load_tree_db_node,
  load_tree_table_node,
  load_tree_col_node,
  set_pass,
  clear_pass,
  query,
  get_query,
  stop_query
} from './handler';
import {
  IDbItem,
  IPass,
  ITreeCmdRes,
  TApiStatus,
  IQueryRes,
  IDBConn
} from './interfaces';

let sqlModelInst: SqlModel;

export function getSqlModel(): SqlModel {
  if (!sqlModelInst) {
    sqlModelInst = new SqlModel();
  }
  return sqlModelInst;
}

export class SqlModel {
  constructor() {
    this._connected = false;
    this._connection = null;
    this._allow_reset = true;
    this._schema_tree = [];
  }

  async init(): Promise<void> {
    // Check reset permission
    const resetRes = await get_reset_allowed();
    if (resetRes && resetRes.status === 'OK' && resetRes.data) {
      this._allow_reset = (resetRes.data as any).allow_reset !== false;
    }

    // Check current connection status
    const connRes = await get_conn_status();
    if (connRes && connRes.status === 'OK' && connRes.data) {
      this._connected = true;
      this._connection = connRes.data as IDBConn;
    } else {
      this._connected = false;
      this._connection = null;
    }
    this._connection_changed.emit(this._connected);
  }

  get connected(): boolean {
    return this._connected;
  }

  get connection(): IDBConn | null {
    return this._connection;
  }

  get allow_reset(): boolean {
    return this._allow_reset;
  }

  async connect(conn: IDBConn): Promise<boolean> {
    const rc = await save_conn(conn);
    if (rc.status === 'OK') {
      this._connected = true;
      this._connection = conn;
      this._schema_tree = [];
      this._connection_changed.emit(true);
      return true;
    } else {
      conn.errmsg = rc.message || '';
      this._conn_error.emit(conn);
      return false;
    }
  }

  async reset(): Promise<void> {
    await reset_conn();
    this._connected = false;
    this._connection = null;
    this._schema_tree = [];
    this._connection_changed.emit(false);
  }

  refresh(path: IDbItem[]): void {
    if (path.length === 0) {
      this._schema_tree = [];
      return;
    }
    let cur_list = this._schema_tree;
    let pptr = this._schema_tree[0];
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
    let cur_list: IDbItem[] = this._schema_tree;

    // Load root level (schemas/databases or tables for SQLite)
    if (cur_list.length === 0) {
      const res = await load_tree_db_node();
      if (res.status === 'NEED-PASS') {
        this._need_passwd.emit(res.pass_info as IPass);
        return false;
      }
      if (res.status !== 'OK') {
        return false;
      }
      this._schema_tree = cur_list = res.data as IDbItem[];
    }

    let db = '';
    let tbl = '';

    if (path.length > 0) {
      if (path[0].type === 'db') {
        db = path[0].name;
        if (path.length > 1) {
          tbl = path[1].name;
        }
      } else if (path[0].type === 'table') {
        tbl = path[0].name;
      }
    }

    for (const p of path) {
      for (let i = 0; i < cur_list.length; i++) {
        if (cur_list[i].name === p.name) {
          if (cur_list[i].next === false || !('next' in cur_list[i])) {
            let res!: ITreeCmdRes;
            if (p.type === 'db') {
              res = await load_tree_table_node(db);
            }
            if (p.type === 'table') {
              res = await load_tree_col_node(db, tbl);
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
    let cur_list: IDbItem[] = this._schema_tree;
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

  set_pass = async (pass_info: IPass): Promise<void> => {
    const rc = await set_pass(pass_info);
    if (rc.status === 'OK') {
      this._passwd_settled.emit(pass_info.db_id);
    } else {
      this.need_passwd.emit(pass_info);
    }
  };

  clear_pass = async (): Promise<void> => {
    await clear_pass();
  };

  get need_passwd(): Signal<SqlModel, IPass> {
    return this._need_passwd;
  }

  get passwd_settled(): Signal<SqlModel, string> {
    return this._passwd_settled;
  }

  get connection_changed(): Signal<SqlModel, boolean> {
    return this._connection_changed;
  }

  get conn_error(): Signal<SqlModel, IDBConn> {
    return this._conn_error;
  }

  private _connected: boolean;
  private _connection: IDBConn | null;
  private _allow_reset: boolean;
  private _schema_tree: IDbItem[];
  private _need_passwd = new Signal<SqlModel, IPass>(this);
  private _passwd_settled = new Signal<SqlModel, string>(this);
  private _connection_changed = new Signal<SqlModel, boolean>(this);
  private _conn_error = new Signal<SqlModel, IDBConn>(this);
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
  isConnReadOnly: boolean;
  stop: () => void;
  query_begin: ISignal<IQueryModel, void>;
  query_finish: ISignal<IQueryModel, IQueryStatus>;
}

export interface IQueryModelOptions {
  schema?: string;
  conn_readonly?: boolean;
}

export class QueryModel implements IQueryModel {
  constructor(options: IQueryModelOptions) {
    this._schema = options.schema;
    this._conn_readonly = !!options.conn_readonly;
    this._running = false;
  }

  async query(sql: string): Promise<IQueryRes> {
    if (this._running) {
      return { status: 'ERR', message: 'has running' };
    }
    const model = getSqlModel();
    if (!model.connected) {
      const st: IQueryStatus = {
        status: 'ERR',
        errmsg: 'no database connection configured'
      };
      this._query_finish.emit(st);
      return { status: 'ERR' };
    }
    this._running = true;
    this._controller = new AbortController();
    this._query_begin.emit();
    const options = { signal: this._controller.signal };
    let rc = await query(sql, options);
    if (rc.status === 'NEED-PASS') {
      model.need_passwd.emit(rc.pass_info as IPass);
      this._running = false;
      const st: IQueryStatus = {
        status: rc.status,
        errmsg: 'please input passwd and try again'
      };
      this._query_finish.emit(st);
      return rc;
    }
    while (rc.status === 'RETRY') {
      (this._taskid = rc.data as string),
        (rc = await get_query(this._taskid, options));
    }
    const st: IQueryStatus = { status: rc.status, errmsg: rc.message };
    this._query_finish.emit(st);
    this._running = false;
    return rc;
  }

  stop = (): void => {
    this._controller.abort();
    stop_query(this._taskid);
  };

  get dbid(): string {
    const model = getSqlModel();
    return model.connection?.db_id || 'default';
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
  private _schema?: string;
  private _taskid!: string;

  private _query_begin = new Signal<IQueryModel, void>(this);
  private _query_finish = new Signal<IQueryModel, IQueryStatus>(this);
  private _controller!: AbortController;

  private _conn_readonly: boolean;
}
