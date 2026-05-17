import { IDisposable } from '@lumino/disposable';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { copyIcon } from '@jupyterlab/ui-components';
import { Menu } from '@lumino/widgets';

import {
  DataGrid,
  TextRenderer,
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel
} from '@lumino/datagrid';

import { LazyTableModel } from './lazyTableModel';
import {
  ColumnHeaderPopover,
  IColumnPopoverContext,
  PopoverAction
} from './columnHeaderPopover';
import { IFilterSpec } from '../model';

export { LazyTableModel } from './lazyTableModel';

namespace CommandIds {
  export const copyToClipboard = 'copy-selection-to-clipboard';
}

namespace Table {
  export interface IOptions {
    translator?: ITranslator;
  }
}

export class Table implements IDisposable {
  constructor(model: LazyTableModel, options?: Table.IOptions) {
    const translator = options?.translator || nullTranslator;
    const trans = translator?.load('jupyterlab_db_explorer');

    this._grid = new DataGrid({
      defaultSizes: {
        rowHeight: 24,
        columnWidth: 144,
        rowHeaderWidth: 64,
        // Room for the column-name row + the stats sub-row.
        columnHeaderHeight: 44
      },
      headerVisibility: 'all'
    });

    this.theme = 'light';

    this._model = model;
    this._grid.dataModel = model;
    this._grid.keyHandler = new BasicKeyHandler();
    this._grid.mouseHandler = new BasicMouseHandler();
    this._grid.selectionModel = new BasicSelectionModel({ dataModel: model });
    this._grid.node.addEventListener('contextmenu', this._onContextMenu);
    this._grid.node.addEventListener('click', this._onClick);
    this._popover = new ColumnHeaderPopover();
    this._popover.action.connect(this._onPopoverAction, this);
    this._contextMenu = this._createContextMenu(trans);
  }

  /** Click in the column-header region opens the per-column popover. */
  private _onClick = (event: MouseEvent): void => {
    const hit = this._grid.hitTest(event.clientX, event.clientY);
    if (!hit || hit.region !== 'column-header') {
      return;
    }
    const col = hit.column;
    if (col < 0 || col >= this._model.columns.length) {
      return;
    }
    const colName = this._model.columns[col];
    const activeSort =
      this._model.activeSort && this._model.activeSort.column === colName
        ? this._model.activeSort.direction
        : null;
    const activeFilter =
      this._model.activeFilters.find(f => f.column === colName) || null;
    const ctx: IColumnPopoverContext = {
      column: colName,
      dtype: this._model.dtypes[col] || 'string',
      stats: this._model.stats[col],
      activeSort,
      activeFilter,
      topN: c => this._model.topN(c, 10)
    };
    this._popover.open(ctx, event.clientX, event.clientY);
  };

  private _onPopoverAction = (
    _sender: ColumnHeaderPopover,
    action: PopoverAction
  ): void => {
    if (action.kind === 'sort') {
      void this._model.applySort(
        action.direction === null
          ? null
          : this._model.activeSort?.column ||
              this._popoverColumnFromLastOpen() ||
              null,
        action.direction || 'ASC'
      );
    } else if (action.kind === 'filter') {
      const filters = this._model.activeFilters.slice();
      if (action.filter) {
        // Replace any existing filter on the same column.
        const idx = filters.findIndex(f => f.column === action.filter!.column);
        if (idx >= 0) {
          filters[idx] = action.filter;
        } else {
          filters.push(action.filter);
        }
      } else {
        // Filter cleared — drop whichever filter was active for that column.
        // We don't have a direct column hint here, so we look back at the
        // popover's context (the popover only clears on its own column).
        const ctxCol = this._popoverColumnFromLastOpen();
        if (ctxCol) {
          const idx = filters.findIndex(f => f.column === ctxCol);
          if (idx >= 0) {
            filters.splice(idx, 1);
          }
        }
      }
      void this._model.applyFilters(filters);
    } else if (action.kind === 'apply-value') {
      // "Click a top value" → adds an equality filter for that column.
      const existing = this._model.activeFilters.slice();
      const newFilter: IFilterSpec = {
        column: action.column,
        op: 'equals',
        value: action.value
      };
      const idx = existing.findIndex(f => f.column === action.column);
      if (idx >= 0) {
        existing[idx] = newFilter;
      } else {
        existing.push(newFilter);
      }
      void this._model.applyFilters(existing);
    }
  };

  private _popoverColumnFromLastOpen(): string | null {
    // The popover renders the active column name in its header; pull it back
    // by reading the DOM since we don't keep a parallel field.
    if (!this._popover.isAttached) {
      return null;
    }
    const titleEl = this._popover.node.querySelector('.d4n-cp__title');
    return titleEl ? titleEl.textContent : null;
  }

  private _createContextMenu(trans: TranslationBundle): Menu {
    const commands = new CommandRegistry();
    commands.addCommand(CommandIds.copyToClipboard, {
      label: trans.__('Copy Selection'),
      icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: () => this._copySelectionToClipboard()
    });
    const menu = new Menu({ commands });
    menu.addItem({ command: CommandIds.copyToClipboard });
    return menu;
  }

  private _copySelectionToClipboard(): void {
    this._grid.copyToClipboard();
  }

  private _onContextMenu = (event: MouseEvent) => {
    const { clientX, clientY } = event;
    this._contextMenu.open(clientX, clientY);
    event.preventDefault();
  };

  set theme(th: string) {
    let renderer: TextRenderer;
    if (th === 'dark') {
      this._grid.style = Private.DARK_STYLE;
      renderer = new TextRenderer({ textColor: '#F3F3F3' });
    } else {
      this._grid.style = Private.LIGHT_STYLE;
      renderer = new TextRenderer({ textColor: '#131313' });
    }
    this._updateRenderer(renderer);
  }

  private _updateRenderer(renderer: TextRenderer): void {
    this._grid.cellRenderers.update({
      body: renderer,
      'column-header': renderer,
      'corner-header': renderer,
      'row-header': renderer
    });
  }

  set dataModel(model: LazyTableModel) {
    this._model = model;
    this._grid.dataModel = model;
    this._grid.selectionModel = new BasicSelectionModel({ dataModel: model });
  }

  get widget(): DataGrid {
    return this._grid;
  }

  get selection(): Array<any> {
    return [];
  }

  get isDisposed(): boolean {
    return this._grid.isDisposed;
  }

  dispose(): void {
    this._grid.node.removeEventListener('contextmenu', this._onContextMenu);
    this._grid.node.removeEventListener('click', this._onClick);
    this._popover.close();
    this._grid.dispose();
  }

  private readonly _grid: DataGrid;
  private readonly _contextMenu: Menu;
  private readonly _popover: ColumnHeaderPopover;
  private _model: LazyTableModel;
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * The light theme for the data grid.
   */
  export const LIGHT_STYLE: DataGrid.Style = {
    ...DataGrid.defaultStyle,
    voidColor: '#F3F3F3',
    backgroundColor: 'white',
    headerBackgroundColor: '#EEEEEE',
    gridLineColor: 'rgba(20, 20, 20, 0.15)',
    headerGridLineColor: 'rgba(20, 20, 20, 0.25)',
    rowBackgroundColor: i => (i % 2 === 0 ? '#F5F5F5' : 'white')
  };

  /**
   * The dark theme for the data grid.
   */
  export const DARK_STYLE: DataGrid.Style = {
    ...DataGrid.defaultStyle,
    voidColor: 'black',
    backgroundColor: '#111111',
    headerBackgroundColor: '#424242',
    gridLineColor: 'rgba(235, 235, 235, 0.15)',
    headerGridLineColor: 'rgba(235, 235, 235, 0.25)',
    rowBackgroundColor: i => (i % 2 === 0 ? '#212121' : '#111111')
  };
}
