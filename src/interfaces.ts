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
  /** Trino-only: 'https' (default for JWT) or 'http'. */
  db_http_scheme?: string;
  name?: string;
  errmsg?: string;
}

export interface IPass {
  db_id: string;
  db_user: string;
  db_pass: string;
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
