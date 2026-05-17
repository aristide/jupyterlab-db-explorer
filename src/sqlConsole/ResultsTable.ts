import { Widget } from '@lumino/widgets';
import { IDisposable } from '@lumino/disposable';

import { ITableData } from '../interfaces';
import { IQueryModel } from '../model';
import { LazyTableModel, Table } from './Table';

export class ResultsTable implements IDisposable {
  constructor() {
    this._model = new LazyTableModel();
    this._table = new Table(this._model);
  }

  get widget(): Widget {
    return this._table.widget;
  }

  set theme(theme: string) {
    this._table.theme = theme;
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
    this._table.dispose();
    this._isDisposed = true;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  private _isDisposed = false;
  private readonly _table: Table;
  private readonly _model: LazyTableModel;
}
