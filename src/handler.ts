import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';
import {
  ITreeCmdRes,
  IApiRes,
  IPass,
  IQueryRes,
  IPageRes,
  IStatsRes,
  IDBConn,
  ISqlVar
} from './interfaces';

export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(
    settings.baseUrl,
    'jupyterlab-db-explorer',
    endPoint
  );

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error: any) {
    if (error.message === 'The user aborted a request.') {
      return { status: 'ERR', message: error.message as string } as any as T;
    }
    throw new ServerConnection.NetworkError(error);
  }

  let data: any = await response.text();
  if (data.length > 0) {
    try {
      data = JSON.parse(data);
    } catch (error) {
      console.log('Not a JSON response body.', response);
    }

    if ('error' in data) {
      if (data.error === 'NEED-PASS') {
        data = { status: 'NEED-PASS', pass_info: data.pass_info };
      } else if (data.error === 'RETRY') {
        data = { status: 'RETRY', data: data.data };
      } else {
        data = { status: 'ERR', message: data.error };
      }
    } else {
      data = { ...data, status: 'OK' };
    }
  }

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message || data);
  }

  return data;
}

export async function GET<T>(
  act: string,
  params: { [key: string]: string },
  options?: RequestInit
): Promise<T> {
  let rc!: T;
  try {
    rc = await requestAPI<any>(
      act + '?' + new URLSearchParams(params).toString(),
      options
    );
  } catch (reason) {
    console.error(
      `The jupyterlab-db-explorer server extension appears to be missing.\n${reason}`
    );
  }
  return rc;
}

export async function POST<T>(
  act: string,
  body: Record<string, unknown>,
  options?: RequestInit
): Promise<T> {
  let rc!: T;
  try {
    rc = await requestAPI<any>(act, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (reason) {
    console.error(
      `The jupyterlab-db-explorer server extension appears to be missing.\n${reason}`
    );
  }
  return rc;
}

export async function DELETE<T>(
  act: string,
  params: { [key: string]: string }
): Promise<T> {
  let rc!: T;
  try {
    rc = await requestAPI<any>(
      act + '?' + new URLSearchParams(params).toString(),
      { method: 'DELETE' }
    );
  } catch (reason) {
    console.error(
      `The jupyterlab-db-explorer server extension appears to be missing.\n${reason}`
    );
  }
  return rc;
}

// --- Connection list ---

export const load_db_tree = async (
  act: string,
  params: { [key: string]: string }
): Promise<ITreeCmdRes> => {
  try {
    return await GET(act, params);
  } catch (reason) {
    return { status: 'ERR', data: reason } as ITreeCmdRes;
  }
};

export const load_tree_root = async (): Promise<ITreeCmdRes> => {
  return await load_db_tree('conns', {});
};

export const load_tree_db_node = async (dbid: string): Promise<ITreeCmdRes> => {
  return await load_db_tree('dbtables', { dbid });
};

export const load_tree_table_node = async (
  dbid: string,
  db: string
): Promise<ITreeCmdRes> => {
  return await load_db_tree('dbtables', { dbid, db });
};

export const load_tree_col_node = async (
  dbid: string,
  db: string,
  tbl: string
): Promise<ITreeCmdRes> => {
  return await load_db_tree('columns', { dbid, db, tbl });
};

// --- Connection CRUD ---

export const edit_conn = async (conn: IDBConn): Promise<IApiRes<any>> => {
  const newObj: { [key: string]: string } = Object.entries(conn).reduce(
    (obj, [key, value]) =>
      value !== undefined ? { ...obj, [key]: value } : obj,
    {}
  );
  return await POST('conns', newObj);
};

export const del_conn = async (dbid: string): Promise<IApiRes<any>> => {
  return await DELETE('conns', { dbid });
};

export const test_conn = async (conn: IDBConn): Promise<IApiRes<any>> => {
  const newObj: { [key: string]: string } = Object.entries(conn).reduce(
    (obj, [key, value]) =>
      value !== undefined ? { ...obj, [key]: value } : obj,
    {}
  );
  return await POST('testconn', newObj);
};

export const reset_conn = async (): Promise<IApiRes<any>> => {
  return await POST('reset', {});
};

export const get_reset_allowed = async (): Promise<
  IApiRes<{ allow_reset: boolean }>
> => {
  try {
    return await GET('reset', {});
  } catch (reason) {
    return { status: 'ERR', data: { allow_reset: true } } as IApiRes<{
      allow_reset: boolean;
    }>;
  }
};

// --- SQL variables ---

export const get_variables = async (): Promise<IApiRes<ISqlVar[]>> => {
  return await GET('variables', {});
};

export const save_variable = async (
  v: ISqlVar
): Promise<IApiRes<ISqlVar[]>> => {
  return await POST('variables', {
    name: v.name,
    value: v.value,
    description: v.description ?? ''
  });
};

export const del_variable = async (
  name: string
): Promise<IApiRes<ISqlVar[]>> => {
  return await DELETE('variables', { name });
};

// --- Password ---

export const set_pass = async (pass_info: IPass): Promise<IApiRes<any>> => {
  const { db_id, db_user, db_pass } = pass_info;
  return await POST('pass', { db_id, db_user, db_pass });
};

export const clear_pass = async (dbid?: string): Promise<IApiRes<any>> => {
  return await DELETE('pass', { dbid: dbid || '' });
};

// --- Query ---

export const query = async (
  sql: string,
  dbid: string,
  schema?: string,
  options?: RequestInit
): Promise<IQueryRes> => {
  return await POST('query', { sql, dbid }, options);
};

export const get_query = async (
  taskid: string,
  options?: RequestInit
): Promise<IQueryRes> => {
  return await GET('query', { taskid }, options);
};

export const stop_query = async (taskid: string): Promise<IQueryRes> => {
  return await DELETE('query', { taskid });
};

export const get_query_page = async (
  taskid: string,
  offset: number,
  limit: number,
  options?: RequestInit
): Promise<IPageRes> => {
  return await GET(
    'query/page',
    { taskid, offset: String(offset), limit: String(limit) },
    options
  );
};

export const get_query_stats = async (
  taskid: string,
  options?: RequestInit
): Promise<IStatsRes> => {
  return await GET('query/stats', { taskid }, options);
};

export const post_query_sort = async (
  taskid: string,
  column: string | null,
  direction: 'ASC' | 'DESC' | string
): Promise<IQueryRes> => {
  return await POST('query/sort', { taskid, column, direction });
};

export const post_query_filter = async (
  taskid: string,
  filters: Array<{ column: string; op: string; value: any }>
): Promise<IQueryRes> => {
  return await POST('query/filter', { taskid, filters });
};

export const get_query_topn = async (
  taskid: string,
  column: string,
  n = 10
): Promise<{
  status: string;
  data?: { values: Array<{ value: any; count: number }> };
}> => {
  return (await GET('query/topn', {
    taskid,
    column,
    n: String(n)
  })) as any;
};

export const get_query_histogram = async (
  taskid: string,
  column: string,
  n_bins = 10
): Promise<{
  status: string;
  data?: { bins: Array<{ min: number; max: number; count: number }> };
}> => {
  return (await GET('query/histogram', {
    taskid,
    column,
    n_bins: String(n_bins)
  })) as any;
};
