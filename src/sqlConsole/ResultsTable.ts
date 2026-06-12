/**
 * Composite results-table widget for the SQL Console.
 *
 * Wraps the @lumino/datagrid grid in a DOM scaffold modeled after the
 * Pygwalker "table" reference design:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  ┌──────────────────────────────────────────────────────────┐  │
 *   │  │  Column-profile strip (one card per column, DOM)         │  │
 *   │  ├──────────────────────────────────────────────────────────┤  │
 *   │  │  DataGrid (canvas body, virtualized)                     │  │
 *   │  └──────────────────────────────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Horizontal scrolling on the grid translates the profile strip in
 * lockstep via a message hook installed by ColumnProfileHeader.
 *
 * The total-row count is no longer shown here — it is surfaced in the
 * console toolbar via the `rowsChanged` signal.
 */
import { BoxLayout, BoxPanel, Widget } from '@lumino/widgets';
import { ISignal, Signal } from '@lumino/signaling';
import { IDisposable } from '@lumino/disposable';

import { ITableData } from '../interfaces';
import { IQueryModel } from '../model';
import { LazyTableModel, Table } from './Table';
import { ColumnProfileHeader } from './ColumnProfileHeader';

/** Live row-count snapshot for the result, emitted as the cursor streams. */
export interface IRowsInfo {
  /** Number of columns — 0 means there is no result yet. */
  columns: number;
  /** Total rows once the cursor is exhausted, else null. */
  total: number | null;
  /** Rows gathered so far. */
  loaded: number;
  /** True once the cursor has reached EOF or the hard cap. */
  exhausted: boolean;
}

export class ResultsTable implements IDisposable {
  constructor() {
    this._model = new LazyTableModel();
    this._table = new Table(this._model);

    // Outer panel — vertical stack: profile strip, grid. No spacing so the
    // column-profile strip sits flush against the grid below it.
    this._panel = new BoxPanel({
      direction: 'top-to-bottom',
      spacing: 0
    });
    this._panel.addClass('pgw-root');
    this._panel.addClass('d4n-rt');

    this._profileHeader = new ColumnProfileHeader(
      this._model,
      this._table.grid,
      {
        onColumnClick: (col, dtype, x, y) => {
          this._table.openPopoverFor(col, dtype, x, y);
        }
      }
    );

    // Wrapper around the canvas grid so we can give it bottom-rounded corners.
    this._tableWrap = new BoxPanel({
      direction: 'top-to-bottom',
      spacing: 0
    });
    this._tableWrap.addClass('pgw-tablewrap');
    this._tableWrap.addWidget(this._table.widget);

    this._panel.addWidget(this._profileHeader);
    this._panel.addWidget(this._tableWrap);

    // Only the grid wrapper stretches. Lumino's BoxLayout defaults
    // `sizeBasis` to 0, so a child with stretch=0 collapses to 0 px unless
    // we hand it an explicit size basis. The profile strip's CSS height
    // is ignored when the parent applies position: absolute; height: 0.
    BoxLayout.setStretch(this._profileHeader, 0);
    BoxLayout.setSizeBasis(this._profileHeader, 108);
    BoxLayout.setStretch(this._tableWrap, 1);

    this._model.changed.connect(this._onModelChanged, this);
    this._emitRows();
  }

  get widget(): Widget {
    return this._panel;
  }

  /** Fires whenever the streamed row count changes — drives the toolbar's
   *  "total rows" readout. */
  get rowsChanged(): ISignal<this, IRowsInfo> {
    return this._rowsChanged;
  }

  set theme(theme: string) {
    this._table.theme = theme;
    if (theme === 'dark') {
      this._panel.addClass('is-dark');
    } else {
      this._panel.removeClass('is-dark');
    }
  }

  /** Drop any cached pages and stats. Used between queries before the new
   *  result lands so the grid clears immediately rather than showing stale
   *  data. */
  clear(): void {
    this._model.clear();
  }

  /** Wire a freshly-completed query into the table. The model takes the
   *  first page from `result.data` and uses `qmodel.fetchPage` to pull
   *  subsequent pages on demand. */
  setData(result: ITableData, qmodel: IQueryModel): void {
    this._model.setQuery(result, qmodel);
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    Signal.clearData(this);
    this._model.changed.disconnect(this._onModelChanged, this);
    this._profileHeader.dispose();
    this._table.dispose();
    this._panel.dispose();
    this._isDisposed = true;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  private _onModelChanged = (): void => {
    this._emitRows();
  };

  private _emitRows(): void {
    this._rowsChanged.emit({
      columns: this._model.columns.length,
      total: this._model.totalRows,
      loaded: this._model.loadedRows || this._model.totalRows || 0,
      exhausted: this._model.cursorExhausted
    });
  }

  private _isDisposed = false;
  private readonly _rowsChanged = new Signal<this, IRowsInfo>(this);
  private readonly _panel: BoxPanel;
  private readonly _profileHeader: ColumnProfileHeader;
  private readonly _tableWrap: BoxPanel;
  private readonly _table: Table;
  private readonly _model: LazyTableModel;
}
