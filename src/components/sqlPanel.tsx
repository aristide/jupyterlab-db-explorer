import { Signal } from '@lumino/signaling';
import * as React from 'react';
import { SqlModel } from '../model';
import { IDBConn } from '../interfaces';
import { IJpServices } from '../JpServices';
import { ConnForm } from './new_conn';
import { DbTree } from './dbTree';

export interface ISqlPanelProps {
  model: SqlModel;
  jp_services: IJpServices;
}

export interface ISqlPanelState {
  showNewConn: boolean;
}

export class SqlPanel extends React.Component<ISqlPanelProps, ISqlPanelState> {
  constructor(props: ISqlPanelProps) {
    super(props);
    this.state = { showNewConn: false };
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
