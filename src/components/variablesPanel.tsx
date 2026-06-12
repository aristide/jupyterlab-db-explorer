import { Signal } from '@lumino/signaling';
import { Notification } from '@jupyterlab/apputils';
import * as React from 'react';
import { SqlModel } from '../model';
import { ISqlVar } from '../interfaces';
import { IJpServices } from '../JpServices';
import { insertIntoActiveSqlConsole } from '../sqlConsole';
import { VariableForm } from './variableForm';

export interface IVariablesPanelProps {
  model: SqlModel;
  jp_services: IJpServices;
}

type Editing = ISqlVar | 'new' | null;

export interface IVariablesPanelState {
  vars: ISqlVar[];
  filter: string;
  loading: boolean;
  editing: Editing;
  confirmDelete: string | null;
}

/**
 * Sidebar panel listing user-defined SQL variables, with add / edit / delete.
 * Reuses the d4n-tv tree shell so it shares the design-system styling and
 * theme tokens. When adding or editing, it swaps the list for a VariableForm
 * (mirroring how SqlPanel swaps in the connection form).
 */
export class VariablesPanel extends React.Component<
  IVariablesPanelProps,
  IVariablesPanelState
> {
  constructor(props: IVariablesPanelProps) {
    super(props);
    this.state = {
      vars: [],
      filter: '',
      loading: true,
      editing: null,
      confirmDelete: null
    };
  }

  async componentDidMount(): Promise<void> {
    this.props.model.variables_changed.connect(this._reload, this);
    await this._reload();
  }

  componentWillUnmount(): void {
    Signal.clearData(this);
  }

  render(): React.ReactElement {
    if (this.state.editing) {
      return this._renderForm();
    }
    return this._renderList();
  }

  private _renderForm(): React.ReactElement {
    const { trans } = this.props.jp_services;
    const { editing, vars } = this.state;
    return (
      <VariableForm
        trans={trans}
        variable={editing === 'new' ? undefined : (editing as ISqlVar)}
        existingNames={vars.map(v => v.name)}
        onSubmit={this._onSubmit}
        onCancel={() => this.setState({ editing: null })}
      />
    );
  }

  private _renderList(): React.ReactElement {
    const { trans } = this.props.jp_services;
    const { vars, filter, loading } = this.state;
    const q = filter.trim().toLowerCase();
    const shown = q
      ? vars.filter(
          v =>
            v.name.toLowerCase().includes(q) ||
            (v.description ?? '').toLowerCase().includes(q)
        )
      : vars;
    const count = vars.length;

    return (
      <section className="d4n-tv d4n-tv--refined d4n-tv--comfortable-density">
        <header className="d4n-tv__header">
          <div className="d4n-tv__header-row">
            <div className="d4n-tv__icon d4n-tv__icon--var" aria-hidden="true">
              <span className="d4n-var-glyph">{'{·}'}</span>
            </div>
            <div className="d4n-tv__titles">
              <h2 className="d4n-tv__title">{trans.__('Variables')}</h2>
              <p className="d4n-tv__subtitle">
                {loading
                  ? trans.__('Loading…')
                  : `${count} ${count === 1 ? trans.__('variable') : trans.__('variables')}`}
              </p>
            </div>
          </div>
        </header>

        <div className="d4n-tv__toolbar">
          <div className="d4n-tv__filter">
            <span className="d4n-tv__filter-icon">
              {this._glyph('search', 14)}
            </span>
            <input
              type="text"
              placeholder={trans.__('filter by name')}
              value={filter}
              onChange={e => this.setState({ filter: e.target.value })}
              aria-label={trans.__('Filter variables')}
            />
            {filter && (
              <button
                type="button"
                className="d4n-tv__filter-clear"
                aria-label={trans.__('Clear filter')}
                onClick={() => this.setState({ filter: '' })}
              >
                {this._glyph('close', 12)}
              </button>
            )}
          </div>
          <span className="d4n-tv__actions">
            <button
              type="button"
              className="d4n-tv-iconbtn d4n-tv-iconbtn--primary"
              aria-label={trans.__('Add variable')}
              title={trans.__('Add variable')}
              onClick={() =>
                this.setState({ editing: 'new', confirmDelete: null })
              }
            >
              {this._glyph('plus', 16)}
            </button>
          </span>
        </div>

        <div
          className="d4n-tv__scroll"
          role="list"
          aria-label={trans.__('SQL variables')}
        >
          {shown.length === 0 ? (
            filter ? (
              <div className="d4n-tv__empty">
                <strong>{trans.__('No matches')}</strong>
                {trans.__('No variable matches "%1".', filter)}
              </div>
            ) : (
              <div className="d4n-var-empty">
                <span className="d4n-var-empty__icon">
                  {this._glyph('var', 19)}
                </span>
                <span className="d4n-var-empty__title">
                  {trans.__('No variables yet')}
                </span>
                <span className="d4n-var-empty__text">
                  {trans.__('Add a variable to reference in SQL as')}{' '}
                  <code>{'${name}'}</code>{' '}
                  {trans.__('— reusable across every query.')}
                </span>
                <button
                  type="button"
                  className="d4n-var-empty__cta"
                  onClick={() =>
                    this.setState({ editing: 'new', confirmDelete: null })
                  }
                >
                  {this._glyph('plus', 15)} {trans.__('New variable')}
                </button>
              </div>
            )
          ) : (
            shown.map(v => this._renderRow(v))
          )}
        </div>
      </section>
    );
  }

  private _renderRow(v: ISqlVar): React.ReactElement {
    const { trans } = this.props.jp_services;
    const confirming = this.state.confirmDelete === v.name;
    return (
      <div className="d4n-var" role="listitem" key={v.name}>
        <span className="d4n-var__badge" aria-hidden="true">
          {'{·}'}
        </span>
        <div className="d4n-var__main">
          <div className="d4n-var__name d4n-mono">{v.name}</div>
          <div className="d4n-var__value d4n-mono" title={v.value}>
            {v.value}
          </div>
          {v.description && (
            <div className="d4n-var__desc">{v.description}</div>
          )}
        </div>
        {confirming ? (
          <div className="d4n-var__confirm">
            <span className="d4n-var__confirm-q">{trans.__('Delete?')}</span>
            <button
              type="button"
              className="d4n-var-mini d4n-var-mini--danger"
              aria-label={trans.__('Confirm delete')}
              onClick={() => this._delete(v.name)}
            >
              {this._glyph('check', 14)}
            </button>
            <button
              type="button"
              className="d4n-var-mini"
              aria-label={trans.__('Cancel')}
              onClick={() => this.setState({ confirmDelete: null })}
            >
              {this._glyph('close', 14)}
            </button>
          </div>
        ) : (
          <div className="d4n-var__actions">
            <button
              type="button"
              className="d4n-var-mini"
              aria-label={trans.__('Insert ${%1} into the SQL editor', v.name)}
              title={trans.__('Insert into SQL editor')}
              onClick={() => this._insert(v.name)}
            >
              {this._glyph('insert', 14)}
            </button>
            <button
              type="button"
              className="d4n-var-mini"
              aria-label={trans.__('Edit %1', v.name)}
              title={trans.__('Edit')}
              onClick={() => this.setState({ editing: v, confirmDelete: null })}
            >
              {this._glyph('edit', 14)}
            </button>
            <button
              type="button"
              className="d4n-var-mini"
              aria-label={trans.__('Delete %1', v.name)}
              title={trans.__('Delete')}
              onClick={() => this.setState({ confirmDelete: v.name })}
            >
              {this._glyph('trash', 14)}
            </button>
          </div>
        )}
      </div>
    );
  }

  private _reload = async (): Promise<void> => {
    const vars = await this.props.model.get_variables();
    this.setState({ vars, loading: false, confirmDelete: null });
  };

  private _onSubmit = async (v: ISqlVar): Promise<string> => {
    const err = await this.props.model.add_variable(v);
    if (!err) {
      this.setState({ editing: null });
    }
    return err;
  };

  private _delete = async (name: string): Promise<void> => {
    await this.props.model.del_variable(name);
    // variables_changed triggers _reload.
  };

  private _insert = (name: string): void => {
    const { trans } = this.props.jp_services;
    const ok = insertIntoActiveSqlConsole('${' + name + '}');
    if (!ok) {
      Notification.warning(
        trans.__('Open a SQL file first, then insert ${%1}.', name),
        { autoClose: 4000 }
      );
    }
  };

  private _glyph(
    name:
      | 'var'
      | 'search'
      | 'close'
      | 'plus'
      | 'edit'
      | 'trash'
      | 'check'
      | 'insert',
    size = 16
  ): React.ReactElement {
    const common = {
      width: size,
      height: size,
      viewBox: '0 0 20 20',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      'aria-hidden': true
    };
    switch (name) {
      case 'var':
        return (
          <svg {...common}>
            <path d="M7 4c-2 0-2.5 2-2.5 6S5 16 7 16" />
            <path d="M13 4c2 0 2.5 2 2.5 6S15 16 13 16" />
            <path d="M8.5 10h3" />
          </svg>
        );
      case 'search':
        return (
          <svg {...common}>
            <circle cx="9" cy="9" r="5.2" />
            <path d="M13 13l3.5 3.5" />
          </svg>
        );
      case 'close':
        return (
          <svg {...common}>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        );
      case 'plus':
        return (
          <svg {...common}>
            <path d="M10 4v12M4 10h12" />
          </svg>
        );
      case 'edit':
        return (
          <svg {...common}>
            <path d="M13.5 4.5l2 2L7 15l-2.5.5L5 13l8.5-8.5z" />
          </svg>
        );
      case 'trash':
        return (
          <svg {...common}>
            <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
          </svg>
        );
      case 'check':
        return (
          <svg {...common}>
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        );
      case 'insert':
        // Document with a plus — "insert into the open SQL file".
        return (
          <svg {...common}>
            <path d="M5 3.5h5l4 4v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
            <path d="M10 3.5V7.5h4" />
            <path d="M9 10.5v4M7 12.5h4" />
          </svg>
        );
    }
  }
}
