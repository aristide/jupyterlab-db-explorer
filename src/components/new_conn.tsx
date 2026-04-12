import * as React from 'react';
import { TranslationBundle } from '@jupyterlab/translation';
import { IDBConn } from '../interfaces';
import {
  connFormStyle,
  formTitleStyle,
  formGroupStyle,
  formFieldStyle,
  formRowStyle,
  submitBtnStyle,
  errStyle
} from './styles';

interface IConnFormProps {
  trans: TranslationBundle;
  conn?: Partial<IDBConn>;
  onSubmit: (conn: IDBConn) => void;
}

interface IConnFormState extends Partial<IDBConn> {
  submitting?: boolean;
}

/**
 * Inline connection form component for the sidebar panel.
 */
export class ConnForm extends React.Component<IConnFormProps, IConnFormState> {
  constructor(props: IConnFormProps) {
    super(props);
    this.state = {
      db_type: '2',
      db_id: 'default',
      ...this.props.conn,
      submitting: false
    };
  }

  render(): React.ReactElement {
    const {
      db_id,
      db_type,
      db_name,
      db_host,
      db_port,
      db_user,
      db_pass,
      name,
      errmsg,
      submitting
    } = this.state;
    const { trans } = this.props;
    const isSqlite = db_type === '6';

    return (
      <div className={connFormStyle}>
        <h3 className={formTitleStyle}>
          {trans.__('Database Connection')}
        </h3>

        {errmsg && <div className={errStyle}>{errmsg}</div>}

        <div className={formGroupStyle}>
          {/* Connection Name & ID */}
          <div className={formFieldStyle}>
            <label>{trans.__('Connection Name')}</label>
            <input
              placeholder={trans.__('e.g. My Database')}
              value={name || ''}
              onChange={this._onChange('name')}
            />
          </div>

          <div className={formFieldStyle}>
            <label>{trans.__('Connection ID')}</label>
            <input
              placeholder={trans.__('Unique identifier')}
              value={db_id || ''}
              onChange={this._onChange('db_id')}
            />
          </div>

          {/* Database Type */}
          <div className={formFieldStyle}>
            <label>{trans.__('Database Type')}</label>
            <select value={db_type} onChange={this._onChange('db_type')}>
              <option value="1">MySQL</option>
              <option value="2">PostgreSQL</option>
              <option value="3">Oracle</option>
              <option value="4">Hive (LDAP)</option>
              <option value="5">Hive (Kerberos)</option>
              <option value="6">SQLite</option>
              <option value="7">Trino</option>
              <option value="8">StarRocks</option>
            </select>
          </div>

          {/* Server fields (hidden for SQLite) */}
          {!isSqlite && (
            <>
              <div className={formRowStyle}>
                <div className={formFieldStyle}>
                  <label>{trans.__('Host')}</label>
                  <input
                    placeholder={trans.__('e.g. localhost')}
                    value={db_host || ''}
                    onChange={this._onChange('db_host')}
                  />
                </div>
                <div className={formFieldStyle}>
                  <label>{trans.__('Port')}</label>
                  <input
                    placeholder={trans.__('Default')}
                    value={db_port || ''}
                    onChange={this._onChange('db_port')}
                  />
                </div>
              </div>

              <div className={formRowStyle}>
                <div className={formFieldStyle}>
                  <label>{trans.__('Username')}</label>
                  <input
                    placeholder={trans.__('Optional')}
                    value={db_user || ''}
                    onChange={this._onChange('db_user')}
                  />
                </div>
                <div className={formFieldStyle}>
                  <label>{trans.__('Password')}</label>
                  <input
                    type="password"
                    placeholder={trans.__('Optional')}
                    value={db_pass || ''}
                    onChange={this._onChange('db_pass')}
                  />
                </div>
              </div>
            </>
          )}

          {/* Database name */}
          <div className={formFieldStyle}>
            <label>
              {isSqlite
                ? trans.__('Database File')
                : trans.__('Database / Schema')}
            </label>
            <input
              placeholder={
                isSqlite
                  ? trans.__('Path to .db file')
                  : trans.__('Default database to connect to')
              }
              value={db_name || ''}
              onChange={this._onChange('db_name')}
            />
          </div>
        </div>

        <button
          className={submitBtnStyle}
          onClick={this._onSubmit}
          disabled={submitting}
        >
          {submitting ? trans.__('Connecting...') : trans.__('Connect')}
        </button>
      </div>
    );
  }

  private _onChange =
    (key: keyof IDBConn) =>
    (
      event:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLSelectElement>
    ) => {
      this.setState({ [key]: event.target.value, errmsg: undefined });
    };

  private _onSubmit = () => {
    const { db_type, db_host, db_name, db_id } = this.state;
    const { trans } = this.props;

    // Basic client-side validation
    if (!db_type) {
      this.setState({ errmsg: trans.__('Please select a database type.') });
      return;
    }
    if (db_type !== '6' && !db_host) {
      this.setState({ errmsg: trans.__('Please enter the host address.') });
      return;
    }
    if (db_type === '6' && !db_name) {
      this.setState({ errmsg: trans.__('Please enter the database file path.') });
      return;
    }

    this.setState({ submitting: true, errmsg: undefined });

    const conn: IDBConn = {
      db_id: db_id || 'default',
      db_type: db_type || '2'
    };

    // Copy non-empty fields
    const fields: (keyof IDBConn)[] = [
      'name',
      'db_host',
      'db_port',
      'db_user',
      'db_pass',
      'db_name'
    ];
    for (const f of fields) {
      const val = this.state[f];
      if (val !== undefined && val !== '') {
        (conn as any)[f] = val;
      }
    }

    this.props.onSubmit(conn);
  };

  /**
   * Called by parent when connection attempt fails, to re-enable the form.
   */
  setError(msg: string): void {
    this.setState({ submitting: false, errmsg: msg });
  }
}
