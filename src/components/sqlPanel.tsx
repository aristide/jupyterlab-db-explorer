import { Signal } from '@lumino/signaling';
import * as React from 'react';
import { SqlModel } from '../model';
import { IDBConn } from '../interfaces';
import { IJpServices } from '../JpServices';
import { ConnForm } from './new_conn';
import { DbTree } from './dbTree';
import { VariablesPanel } from './variablesPanel';

export interface ISqlPanelProps {
  model: SqlModel;
  jp_services: IJpServices;
}

type TabId = 'connections' | 'variables';

export interface ISqlPanelState {
  activeTab: TabId;
  showNewConn: boolean;
}

export class SqlPanel extends React.Component<ISqlPanelProps, ISqlPanelState> {
  constructor(props: ISqlPanelProps) {
    super(props);
    this.state = { activeTab: 'connections', showNewConn: false };
  }

  componentDidMount(): void {
    this.props.model.conn_changed.connect(() => {
      this.setState({ showNewConn: false });
    }, this);
  }

  componentWillUnmount(): void {
    Signal.clearData(this);
  }

  render(): React.ReactElement {
    const { trans } = this.props.jp_services;
    const { activeTab } = this.state;
    return (
      <div className="d4n-shell">
        <div className="d4n-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connections'}
            className={`d4n-tab${activeTab === 'connections' ? ' is-active' : ''}`}
            onClick={() => this.setState({ activeTab: 'connections' })}
          >
            {trans.__('Connections')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'variables'}
            className={`d4n-tab${activeTab === 'variables' ? ' is-active' : ''}`}
            onClick={() => this.setState({ activeTab: 'variables' })}
          >
            {trans.__('Variables')}
          </button>
        </div>
        <div className="d4n-shell__body">
          {activeTab === 'connections'
            ? this._renderConnections()
            : this._renderVariables()}
        </div>
      </div>
    );
  }

  private _renderConnections(): React.ReactElement {
    if (this.state.showNewConn) {
      return this._renderNewConnForm();
    }
    return (
      <DbTree
        model={this.props.model}
        jp_services={this.props.jp_services}
        onAddConn={this._add}
      />
    );
  }

  private _renderVariables(): React.ReactElement {
    return (
      <VariablesPanel
        model={this.props.model}
        jp_services={this.props.jp_services}
      />
    );
  }

  private _renderNewConnForm(): React.ReactElement {
    const { trans } = this.props.jp_services;
    return (
      <ConnForm
        trans={trans}
        onSubmit={this._onCreateConn}
        onCancel={() => this.setState({ showNewConn: false })}
        onTest={this._onTestConn}
        allowedTypes={this.props.model.allowed_types}
        vaultEnabled={this.props.model.vault_enabled}
      />
    );
  }

  private _add = (): void => {
    this.setState({ showNewConn: true });
  };

  private _onCreateConn = async (conn: IDBConn): Promise<void> => {
    await this.props.model.add_conn(conn);
  };

  private _onTestConn = async (conn: IDBConn): Promise<IDBConn> => {
    return await this.props.model.test_conn(conn);
  };
}
