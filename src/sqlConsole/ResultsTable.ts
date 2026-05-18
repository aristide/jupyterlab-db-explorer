/**
 * Composite results-table widget for the SQL Console.
 *
 * Wraps the @lumino/datagrid grid in a DOM scaffold modeled after the
 * Pygwalker "table" reference design:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  RESULTS              (eyebrow + meta line "Showing 1–N of M") │
 *   │  ┌──────────────────────────────────────────────────────────┐  │
 *   │  │  Column-profile strip (one card per column, DOM)         │  │
 *   │  ├──────────────────────────────────────────────────────────┤  │
 *   │  │  DataGrid (canvas body, virtualized)                     │  │
 *   │  └──────────────────────────────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Horizontal scrolling on the grid translates the profile strip in
 * lockstep via a message hook installed by ColumnProfileHeader.
 */
import { BoxLayout, BoxPanel, Widget } from '@lumino/widgets';
import { IDisposable } from '@lumino/disposable';

import { ITableData } from '../interfaces';
import { IQueryModel } from '../model';
import { LazyTableModel, Table } from './Table';
import { ColumnProfileHeader } from './ColumnProfileHeader';

export class ResultsTable implements IDisposable {
  constructor() {
    this._model = new LazyTableModel();
    this._table = new Table(this._model);

    // Outer panel — vertical stack: eyebrow, meta, profile strip, grid.
    this._panel = new BoxPanel({
      direction: 'top-to-bottom',
      spacing: 12
    });
    this._panel.addClass('pgw-root');
    this._panel.addClass('d4n-rt');

    this._headerWidget = new Widget({ node: document.createElement('header') });
    this._headerWidget.addClass('pgw-header');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'pgw-header__eyebrow';
    eyebrow.textContent = 'Results';
    this._headerWidget.node.appendChild(eyebrow);

    this._metaWidget = new Widget({ node: document.createElement('div') });
    this._metaWidget.addClass('pgw-meta');
    this._resultsLine = document.createElement('p');
    this._resultsLine.className = 'pgw-results';
    this._metaWidget.node.appendChild(this._resultsLine);

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

    this._panel.addWidget(this._headerWidget);
    this._panel.addWidget(this._metaWidget);
    this._panel.addWidget(this._profileHeader);
    this._panel.addWidget(this._tableWrap);

    // Only the grid wrapper stretches. Lumino's BoxLayout defaults
    // `sizeBasis` to 0, so a child with stretch=0 collapses to 0 px unless
    // we hand it an explicit size basis. The profile strip's CSS height
    // is ignored when the parent applies position: absolute; height: 0.
    BoxLayout.setStretch(this._headerWidget, 0);
    BoxLayout.setSizeBasis(this._headerWidget, 24);
    BoxLayout.setStretch(this._metaWidget, 0);
    BoxLayout.setSizeBasis(this._metaWidget, 22);
    BoxLayout.setStretch(this._profileHeader, 0);
    BoxLayout.setSizeBasis(this._profileHeader, 156);
    BoxLayout.setStretch(this._tableWrap, 1);

    this._model.changed.connect(this._onModelChanged, this);
    this._renderMeta();
  }

  get widget(): Widget {
    return this._panel;
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
    this._renderMeta();
  };

  private _renderMeta(): void {
    const total = this._model.totalRows;
    const cols = this._model.columns.length;
    if (cols === 0) {
      this._resultsLine.textContent = 'No results';
      return;
    }
    const loaded = this._model.loadedRows || total;
    const exhausted = this._model.cursorExhausted;
    const formatN = (n: number): string => n.toLocaleString('en-US');
    if (total === 0) {
      this._resultsLine.textContent = '0 results';
      return;
    }
    if (exhausted) {
      this._resultsLine.innerHTML =
        `Showing <strong>1</strong>–<strong>${formatN(total)}</strong>` +
        ` <em>of</em> <strong>${formatN(total)}</strong> <em>results</em>`;
    } else {
      this._resultsLine.innerHTML =
        `Showing <strong>1</strong>–<strong>${formatN(loaded)}</strong>` +
        ` <em>of</em> <strong>${formatN(total)}</strong> <em>results</em>` +
        ` <em>(loading…)</em>`;
    }
  }

  private _isDisposed = false;
  private readonly _panel: BoxPanel;
  private readonly _headerWidget: Widget;
  private readonly _metaWidget: Widget;
  private readonly _resultsLine: HTMLParagraphElement;
  private readonly _profileHeader: ColumnProfileHeader;
  private readonly _tableWrap: BoxPanel;
  private readonly _table: Table;
  private readonly _model: LazyTableModel;
}
