export enum ConnType {
  DB_MYSQL = 1,
  DB_PGSQL = 2,
  DB_ORACLE = 3,
  DB_HIVE_LDAP = 4,
  DB_HIVE_KERBEROS = 5,
  DB_SQLITE = 6,
  DB_TRINO = 7,
  DB_STARROCKS = 8,
  DB_SQLSERVER = 9
}

export interface IDbItem {
  type: string;
  name: string;
  subtype?: ConnType | string;
  fix?: boolean;
  desc?: string;
  /** Conn items only: the connection pins a default database/catalog.
   *  Without one, first-level tree nodes are databases (PG/SQL Server) or
   *  catalog.schema pairs (Trino) rather than schemas, which changes how a
   *  table must be qualified in generated SQL. */
  has_db?: boolean;
  next?: IDbItem[] | false;
}

export interface IDBConn {
  db_id: string;
  db_type: string;
  db_name?: string;
  db_host?: string;
  db_port?: string;
  db_user?: string;
  db_pass?: string;
  /** 'password' (default) or 'jwt' — only Trino & StarRocks honour 'jwt'. */
  db_auth_type?: string;
  /** Trino-only: 'https' or 'http'. Backend defaults to https whenever
   *  credentialed auth (password/JWT) is in play. */
  db_http_scheme?: string;
  /** libpq-style SSL mode (disable/allow/prefer/require/verify-ca/
   *  verify-full); mapped per-dialect by engine.py. */
  db_ssl_mode?: string;
  /** Connect timeout in seconds. */
  db_conn_timeout?: string;
  /** Extra DBAPI connect params — 'key=value' pairs, one per line. */
  db_conn_opts?: string;
  name?: string;
  errmsg?: string;
}

export interface IPass {
  db_id: string;
  db_user: string;
  db_pass: string;
}

/** A user-defined SQL variable, referenced in SQL as `${name}`. */
export interface ISqlVar {
  name: string;
  value: string;
  description?: string;
}

export type TApiStatus = 'OK' | 'NEED-PASS' | 'RETRY' | 'ERR';

export interface IParam {
  [key: string]: string | number | null;
}

export interface IApiRes<T> {
  status: TApiStatus;
  pass_info?: IPass; // if status if NEED_PASS,
  message?: string;
  data?: T;
}

export interface ITreeCmdRes {
  status: TApiStatus;
  message?: string;
  data?: Array<IDbItem>;
  pass_info?: IPass; // if status if NEED_PASS,
}

export type ColumnDtype = 'number' | 'datetime' | 'string';

export interface IColumnStats {
  dtype: ColumnDtype;
  count: number;
  null_count: number;
  /** Number of distinct values, or '1000+' once capped. */
  distinct: number | string;
  min?: number | string;
  max?: number | string;
  mean?: number;
}

export interface ITableData {
  columns: Array<string>;
  /** First page of rows; subsequent pages fetched via getQueryPage. */
  data: Array<Array<any>>;
  /** Inferred per-column dtypes for the stats sub-row + chart-shelf. */
  dtypes?: ColumnDtype[];
  /** Running per-column statistics — grow as more pages are fetched. */
  stats?: IColumnStats[];
  /** Total rows once the cursor has been exhausted, otherwise null. */
  total_rows?: number | null;
  /** True when the streaming cursor has reached EOF or the hard cap. */
  cursor_exhausted?: boolean;
  /** Backend page size — frontend should use this when computing fetches. */
  page_size?: number;
  /** Server-issued id used to fetch subsequent pages / stats. */
  taskid?: string;
}

export interface IQueryRes {
  status: TApiStatus;
  data?: ITableData | string;
  message?: string;
  pass_info?: IPass; // if status if NEED_PASS,
}

export interface IPageData {
  data: Array<Array<any>>;
  total_rows?: number | null;
  cursor_exhausted?: boolean;
}

export interface IPageRes {
  status: TApiStatus;
  data?: IPageData;
  message?: string;
}

export interface IStatsData {
  stats: IColumnStats[];
  rows_seen?: number;
  total_rows?: number | null;
  cursor_exhausted?: boolean;
}

export interface IStatsRes {
  status: TApiStatus;
  data?: IStatsData;
  message?: string;
}

export interface IHistogramBin {
  min: number;
  max: number;
  count: number;
}

export interface IHistogramRes {
  status: TApiStatus;
  data?: { bins: IHistogramBin[] };
  message?: string;
}

export interface IConnectionStatus {
  connected: boolean;
  connection: IDBConn | null;
  allow_reset: boolean;
}
