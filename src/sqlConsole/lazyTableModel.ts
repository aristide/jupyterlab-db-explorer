import { DataModel } from '@lumino/datagrid';

import {
  ColumnDtype,
  IColumnStats,
  IHistogramBin,
  ITableData
} from '../interfaces';
import { IFilterSpec, IQueryModel, SortDirection } from '../model';

const DEFAULT_PAGE_SIZE = 1000;
const PLACEHOLDER = '…';

/**
 * A lazy `DataModel` that fetches pages on demand from a `QueryModel` and
 * renders a two-row column header (name + per-column stats summary).
 *
 * The grid's virtualization asks `data('body', row, col)` for visible cells
 * only; misses kick off a page fetch and return a placeholder. When the
 * fetch resolves we cache the page and emit `cells-changed` so the grid
 * repaints the affected rows.
 *
 * A generation counter (`_gen`) is bumped on each `setQuery` so in-flight
 * fetches from a previous query are discarded once they resolve.
 *
 * Kept in its own module so it can be unit-tested without dragging in
 * `@jupyterlab/ui-components` (which doesn't load cleanly under Jest's
 * Node environment).
 */
export class LazyTableModel extends DataModel {
  constructor() {
    super();
    this._columns = [];
    this._dtypes = [];
    this._stats = [];
    this._totalRows = 0;
    this._cursorExhausted = false;
    this._pageSize = DEFAULT_PAGE_SIZE;
  }

  /** Reset the model to a fresh query result. Bumps the generation counter
   *  so stale page fetches from the prior query are dropped on arrival. */
  setQuery(data: ITableData, qmodel: IQueryModel | null): void {
    this._gen++;
    this._columns = data.columns || [];
    this._dtypes =
      data.dtypes && data.dtypes.length === this._columns.length
        ? data.dtypes
        : this._columns.map(() => 'string' as ColumnDtype);
    this._stats = data.stats || [];
    this._pageSize = data.page_size || DEFAULT_PAGE_SIZE;
    this._totalRows = data.total_rows ?? (data.data ? data.data.length : 0);
    this._cursorExhausted = !!data.cursor_exhausted;
    this._pages = new Map();
    this._inflight = new Set();
    this._qmodel = qmodel;
    // Sort/filter overlays come back from the backend in the payload.
    const backendSort = (
      data as ITableData & { sort?: [string, string] | null }
    ).sort;
    this._activeSort =
      backendSort && backendSort.length === 2
        ? { column: backendSort[0], direction: backendSort[1] as SortDirection }
        : null;
    const backendFilters = (data as ITableData & { filters?: IFilterSpec[] })
      .filters;
    this._activeFilters = Array.isArray(backendFilters) ? backendFilters : [];
    if (data.data && data.data.length > 0) {
      this._pages.set(0, data.data);
    }
    this.emitChanged({ type: 'model-reset' });
  }

  /** Discard any cached pages and force a re-fetch from the cursor. */
  clear(): void {
    this._gen++;
    this._columns = [];
    this._dtypes = [];
    this._stats = [];
    this._totalRows = 0;
    this._cursorExhausted = false;
    this._pages = new Map();
    this._inflight = new Set();
    this._qmodel = null;
    this.emitChanged({ type: 'model-reset' });
  }

  /** Whether the streaming cursor has been fully drained (or hit the
   *  configured hard cap). Consumed by the toolbar footer in later phases
   *  and useful for surfacing a "results truncated" indicator. */
  get cursorExhausted(): boolean {
    return this._cursorExhausted;
  }

  get totalRows(): number {
    return this._totalRows;
  }

  /** Approximate count of rows already streamed into the page cache. Used
   *  by the meta strip to show "Showing 1–N (loading…)" while the cursor
   *  is still draining. */
  get loadedRows(): number {
    let maxEnd = 0;
    for (const [start, page] of this._pages) {
      const end = start + page.length;
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
    return Math.min(maxEnd, this._totalRows);
  }

  get columns(): string[] {
    return this._columns;
  }

  get dtypes(): ColumnDtype[] {
    return this._dtypes;
  }

  get stats(): IColumnStats[] {
    return this._stats;
  }

  /** Currently applied sort overlay (mirrors the backend session). */
  get activeSort(): { column: string; direction: SortDirection } | null {
    return this._activeSort;
  }

  /** Currently applied filter set (one per column max in our UI). */
  get activeFilters(): IFilterSpec[] {
    return this._activeFilters;
  }

  /** Apply a sort overlay (or clear with column=null), round-tripping to
   *  the backend and swapping in the fresh metadata + first page. */
  async applySort(
    column: string | null,
    direction: SortDirection = 'ASC'
  ): Promise<void> {
    if (!this._qmodel) {
      return;
    }
    const result = await this._qmodel.setSort(column, direction);
    if (result) {
      this.setQuery(result, this._qmodel);
    }
  }

  /** Replace the active filter set wholesale and round-trip. */
  async applyFilters(filters: IFilterSpec[]): Promise<void> {
    if (!this._qmodel) {
      return;
    }
    const result = await this._qmodel.setFilter(filters);
    if (result) {
      this.setQuery(result, this._qmodel);
    }
  }

  /** Hand the popover its top-N value loader without exposing _qmodel. */
  topN(column: string, n = 10) {
    return this._qmodel ? this._qmodel.topN(column, n) : Promise.resolve([]);
  }

  /** Numeric value-distribution histogram (used by the column profile
   *  header strip). Returns the empty list when there's no backing query. */
  histogram(column: string, n_bins = 10): Promise<IHistogramBin[]> {
    return this._qmodel
      ? this._qmodel.histogram(column, n_bins)
      : Promise.resolve([]);
  }

  // ── DataModel API ─────────────────────────────────────────────────────
  rowCount(region: DataModel.RowRegion): number {
    return region === 'body' ? this._totalRows : 2;
  }

  columnCount(region: DataModel.ColumnRegion): number {
    return region === 'body' ? this._columns.length : 1;
  }

  data(region: DataModel.CellRegion, row: number, column: number): any {
    if (region === 'row-header') {
      return row + 1;
    }
    if (region === 'corner-header') {
      return '';
    }
    if (region === 'column-header') {
      if (row === 0) {
        return this._columns[column] || '';
      }
      return this._formatStats(column);
    }
    return this._cell(row, column);
  }

  // ── Internal ─────────────────────────────────────────────────────────
  private _cell(row: number, column: number): any {
    const pageStart = Math.floor(row / this._pageSize) * this._pageSize;
    const page = this._pages.get(pageStart);
    if (page) {
      const r = page[row - pageStart];
      if (r === undefined) {
        return PLACEHOLDER;
      }
      return this._serialize(r[column]);
    }
    if (!this._inflight.has(pageStart) && this._qmodel) {
      this._fetchPage(pageStart);
    }
    return PLACEHOLDER;
  }

  private async _fetchPage(pageStart: number): Promise<void> {
    if (!this._qmodel) {
      return;
    }
    this._inflight.add(pageStart);
    const myGen = this._gen;
    try {
      const res = await this._qmodel.fetchPage(pageStart, this._pageSize);
      if (myGen !== this._gen) {
        return;
      }
      if (!res || !res.data) {
        return;
      }
      this._pages.set(pageStart, res.data);
      if (
        res.total_rows !== null &&
        res.total_rows !== undefined &&
        res.total_rows !== this._totalRows
      ) {
        this._totalRows = res.total_rows;
        this.emitChanged({ type: 'model-reset' });
        return;
      }
      if (res.cursor_exhausted !== undefined) {
        this._cursorExhausted = res.cursor_exhausted;
      }
      this.emitChanged({
        type: 'cells-changed',
        region: 'body',
        row: pageStart,
        column: 0,
        rowSpan: res.data.length,
        columnSpan: this._columns.length
      });
    } finally {
      this._inflight.delete(pageStart);
    }
  }

  private _serialize(value: any): any {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return value;
  }

  private _formatStats(col: number): string {
    const s: IColumnStats | undefined = this._stats[col];
    const dtype = this._dtypes[col] || 'string';
    const count = s ? s.count : 0;
    const distinct = s ? s.distinct : 0;
    const countLbl = LazyTableModel.formatCount(count);
    const distinctLbl =
      typeof distinct === 'number'
        ? LazyTableModel.formatCount(distinct)
        : String(distinct);
    if (dtype === 'number' && s) {
      const min = s.min !== undefined ? LazyTableModel.formatNum(s.min) : '–';
      const max = s.max !== undefined ? LazyTableModel.formatNum(s.max) : '–';
      const mean =
        s.mean !== undefined ? `μ ${LazyTableModel.formatNum(s.mean)}` : '';
      return `NUM · ${countLbl} · [${min} – ${max}]${mean ? ' · ' + mean : ''}`;
    }
    if (dtype === 'datetime' && s) {
      const min = s.min !== undefined ? String(s.min) : '–';
      const max = s.max !== undefined ? String(s.max) : '–';
      return `DATE · ${countLbl} · ${min} → ${max}`;
    }
    return `TEXT · ${countLbl} · ${distinctLbl} unique`;
  }

  static formatCount(n: number): string {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 1_000) {
      return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return String(n);
  }

  static formatNum(v: number | string): string {
    const n = typeof v === 'number' ? v : Number(v);
    if (!isFinite(n)) {
      return String(v);
    }
    if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) {
      return n.toExponential(2);
    }
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toFixed(2);
  }

  private _columns: string[];
  private _dtypes: ColumnDtype[];
  private _stats: IColumnStats[];
  private _totalRows: number;
  private _cursorExhausted: boolean;
  private _pageSize: number;
  private _pages: Map<number, any[][]> = new Map();
  private _inflight: Set<number> = new Set();
  private _qmodel: IQueryModel | null = null;
  private _gen = 0;
  private _activeSort: { column: string; direction: SortDirection } | null =
    null;
  private _activeFilters: IFilterSpec[] = [];
}
