import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { ISignal, Signal } from '@lumino/signaling';
import { showErrorMessage } from '@jupyterlab/apputils';

import { TranslationBundle } from '@jupyterlab/translation';

import { getSqlModel, IQueryModel, IQueryStatus } from '../model';
import { errorIcon } from '../icons';
import { Loading } from '../components/loading';
import { IRowsInfo } from './ResultsTable';

// class ToolbarText extends Widget {
//     constructor(txt: string, className?: string) {
//         super();
//         this.addClass('jp-sql-exp-toolbar-text');
//         if (className) this.addClass(className)
//         this.node.innerText = txt
//     }
// }

export interface IRunStatusOptions {
  model: IQueryModel;
  trans: TranslationBundle;
  onChange: (dbid: string) => void;
  /** Streamed row-count updates for the active result, shown after the timer. */
  rowsChanged?: ISignal<unknown, IRowsInfo>;
}

interface IRunStatusState {
  dbid: string;
  running: 0 | 1 | 2;
  time: number;
  errmsg: string;
  rows: IRowsInfo | null;
}

class RunStatusComponent extends React.Component<
  IRunStatusOptions,
  IRunStatusState
> {
  constructor(props: IRunStatusOptions) {
    super(props);
    this.state = {
      dbid: props.model.dbid,
      running: 0,
      time: 0,
      errmsg: '',
      rows: null
    };
  }

  componentDidMount = async (): Promise<void> => {
    const { model, rowsChanged } = this.props;
    model.query_begin.connect(this._start_query, this);
    model.query_finish.connect(this._finish_query, this);
    rowsChanged?.connect(this._on_rows, this);
    const m = getSqlModel();
    await m.get_list([]);
    m.conn_changed.connect(() => {
      this.setState({ dbid: model.dbid });
    }, this);
  };

  componentWillUnmount = (): void => {
    //Clear all signal connections
    Signal.clearData(this);
    if (this._timer_id) {
      clearInterval(this._timer_id);
    }
  };

  /**
   * Renders the component.
   *
   * @returns React element
   */
  render(): React.ReactElement {
    const { dbid, running, time, errmsg, rows } = this.state;
    const { trans, model } = this.props;
    return (
      <>
        {model.isConnReadOnly ? (
          <span className="jp-sql-exp-toolbar-text">{dbid}</span>
        ) : (
          <div className="jp-HTMLSelect jp-DefaultStyle jp-Notebook-toolbarCellTypeDropdown">
            <select onChange={this._onChangeDB} value={dbid}>
              <option value="">{trans.__('NO SELECT')}</option>
              {model.conns.map(n => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
        {running === 1 && <Loading />}
        {running === 2 && (
          <errorIcon.react
            tag="span"
            width="14px"
            height="14px"
            className="jp-sql-exp-toolbar-icon"
          />
        )}
        {time !== 0 && (
          <span className="jp-sql-exp-toolbar-timer">
            {trans.__('elapsed time')}：{this.convertMilliseconds(time)}
          </span>
        )}
        {rows && rows.columns > 0 && (
          <span className="jp-sql-exp-toolbar-rows">
            {this._rowsLabel(rows)}
          </span>
        )}
        {running === 2 && (
          <span
            className="jp-sql-exp-toolbar-errmsg"
            onClick={this._showDetail}
          >
            {errmsg}
          </span>
        )}
      </>
    );
  }

  private _rowsLabel(rows: IRowsInfo): string {
    const { trans } = this.props;
    const gathered = rows.exhausted ? (rows.total ?? rows.loaded) : rows.loaded;
    const n = (gathered ?? 0).toLocaleString('en-US');
    const word = gathered === 1 ? trans.__('row') : trans.__('rows');
    return rows.exhausted ? `${n} ${word}` : `${n} ${word} …`;
  }

  private _on_rows = (_: unknown, rows: IRowsInfo): void => {
    this.setState({ rows });
  };

  private convertMilliseconds(milliseconds: number): string {
    const { trans } = this.props;
    let seconds = milliseconds / 1000;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    let timeString = '';

    if (hours > 0) {
      timeString += hours + ' ' + trans.__('hour ');
    }

    if (minutes > 0) {
      timeString += minutes + ' ' + trans.__('min ');
    }

    if (milliseconds < 10000) {
      timeString += seconds.toFixed(1) + ' ' + trans.__('sec');
    } else {
      timeString += Math.round(seconds) + ' ' + trans.__('sec');
    }

    return timeString;
  }

  private _start_query = () => {
    this._timer_id = setInterval(this._timer_fast, 107);
    this.setState({ running: 1, time: 0, rows: null });
  };

  private _finish_query = (_: IQueryModel, e: IQueryStatus) => {
    if (this._timer_id) {
      clearInterval(this._timer_id);
    }
    this._timer_id = null;
    if (e.status === 'OK') {
      this.setState({ running: 0 });
    } else {
      this.setState({ running: 2, errmsg: e.errmsg || '' });
    }
  };

  private _timer_fast = () => {
    let { time } = this.state;
    if (time > 10000) {
      if (this._timer_id) {
        clearInterval(this._timer_id);
      }
      this._timer_id = setInterval(this._timer_slow, 1000);
    }
    time += 107;
    this.setState({ time });
  };

  private _timer_slow = () => {
    let { time } = this.state;
    time += 1000;
    this.setState({ time });
  };

  private _onChangeDB = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { running } = this.state;
    if (running === 1) {
      return;
    }
    const dbid = e.target.value;
    this.setState({ dbid });
    this.props.onChange(dbid);
  };

  private _showDetail = () => {
    const { errmsg } = this.state;
    const { trans } = this.props;
    showErrorMessage(trans.__('ERROR'), errmsg);
  };

  private _timer_id!: ReturnType<typeof setTimeout> | null;
}

export class RunStatus extends ReactWidget {
  constructor(options: IRunStatusOptions) {
    super();
    this._queryModel = options.model;
    this._trans = options.trans;
    this._onChange = options.onChange;
    this._rowsChanged = options.rowsChanged;
  }

  render(): JSX.Element {
    return (
      <RunStatusComponent
        model={this._queryModel}
        trans={this._trans}
        onChange={this._onChange}
        rowsChanged={this._rowsChanged}
      />
    );
  }

  private readonly _queryModel: IQueryModel;
  private readonly _trans: TranslationBundle;
  private readonly _onChange: (dbid: string) => void;
  private readonly _rowsChanged?: ISignal<unknown, IRowsInfo>;
}
