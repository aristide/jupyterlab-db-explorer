import * as React from 'react';
import { TranslationBundle } from '@jupyterlab/translation';
import { Notification } from '@jupyterlab/apputils';
import { IDBConn } from '../interfaces';
import { sqlIcon } from '../icons';
import {
  connFormStyle,
  connFormHeader,
  connFormBody,
  formGroupStyle,
  formFieldStyle,
  formRowStyle,
  errStyle,
  formSectionTitle,
  formHeaderStyle,
  formHeaderIconStyle,
  formHeaderTextStyle,
  formDivider,
  dbTypePicker,
  dbTypeOption,
  dbTypeOptionSelected,
  formBottomBar,
  formBtnOutline,
  formBtnPrimary,
  formBtnTest,
  formOptionalLabel,
  formTestSuccess
} from './styles';

const DB_TYPES = [
  { value: '2', label: 'PostgreSQL' },
  { value: '1', label: 'MySQL' },
  { value: '6', label: 'SQLite' },
  { value: '3', label: 'Oracle' },
  { value: '4', label: 'Hive' },
  { value: '7', label: 'Trino' },
  { value: '8', label: 'StarRocks' }
];

const DEFAULT_PORTS: { [key: string]: string } = {
  '1': '3306',
  '2': '5432',
  '3': '1521',
  '4': '10000',
  '5': '10000',
  '7': '8080',
  '8': '9030'
};

interface IConnFormProps {
  trans: TranslationBundle;
  conn?: Partial<IDBConn>;
  onSubmit: (conn: IDBConn) => void;
  onCancel?: () => void;
  onTest?: (conn: IDBConn) => Promise<IDBConn>;
  allowedTypes?: string[] | null;
}

interface IConnFormState extends Partial<IDBConn> {
  submitting?: boolean;
  testing?: boolean;
  testResult?: 'success' | 'error' | null;
  testMsg?: string;
}

export class ConnForm extends React.Component<IConnFormProps, IConnFormState> {
  constructor(props: IConnFormProps) {
    super(props);
    this.state = {
      db_type: '2',
      db_id: '',
      ...this.props.conn,
      submitting: false,
      testing: false,
      testResult: null,
      testMsg: ''
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
      submitting,
      testing,
      testResult,
      testMsg
    } = this.state;
    const { trans, onCancel, onTest, allowedTypes } = this.props;
    const isSqlite = db_type === '6';
    const defaultPort = DEFAULT_PORTS[db_type || '2'] || '';
    const visibleTypes =
      allowedTypes && allowedTypes.length > 0
        ? DB_TYPES.filter(t => allowedTypes.includes(t.value))
        : DB_TYPES;

    return (
      <div className={connFormStyle}>
        {/* ---- Fixed Header ---- */}
        <div className={connFormHeader}>
          <div className={formHeaderStyle}>
            <div className={formHeaderIconStyle}>
              <sqlIcon.react tag="span" width="28px" height="28px" />
            </div>
            <div className={formHeaderTextStyle}>
              <div className="title">{trans.__('New connection')}</div>
              <div className="subtitle">
                {trans.__('Configure database credentials')}
              </div>
            </div>
          </div>
          <hr className={formDivider} />
        </div>

        {/* ---- Scrollable Body ---- */}
        <div className={connFormBody}>
          {/* Error / Test result */}
          {errmsg && <div className={errStyle}>{errmsg}</div>}
          {testResult === 'success' && (
            <div className={formTestSuccess}>{testMsg}</div>
          )}
          {testResult === 'error' && <div className={errStyle}>{testMsg}</div>}

          {/* Name & Identifier */}
          <div className={formGroupStyle}>
            <div className={formRowStyle}>
              <div className={formFieldStyle}>
                <label>{trans.__('Connection name')}</label>
                <input
                  placeholder={trans.__('production-db')}
                  value={name || ''}
                  onChange={this._onChange('name')}
                />
              </div>
              <div className={formFieldStyle}>
                <label>{trans.__('Identifier')}</label>
                <input
                  placeholder={trans.__('Auto-generated')}
                  value={db_id || ''}
                  onChange={this._onChange('db_id')}
                />
              </div>
            </div>

            {/* Database Type */}
            <div className={formFieldStyle}>
              <label>{trans.__('Database type')}</label>
              <div className={dbTypePicker}>
                {visibleTypes.map(t => (
                  <button
                    key={t.value}
                    className={
                      db_type === t.value ? dbTypeOptionSelected : dbTypeOption
                    }
                    onClick={() =>
                      this.setState({
                        db_type: t.value,
                        errmsg: undefined,
                        testResult: null
                      })
                    }
                    type="button"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SERVER section */}
          {!isSqlite && (
            <>
              <hr className={formDivider} />
              <div className={formSectionTitle}>{trans.__('SERVER')}</div>
              <div className={formGroupStyle}>
                <div className={formRowStyle}>
                  <div className={formFieldStyle} style={{ flex: 2 }}>
                    <label>{trans.__('Host')}</label>
                    <input
                      placeholder={trans.__('e.g. db.example.com')}
                      value={db_host || ''}
                      onChange={this._onChange('db_host')}
                    />
                  </div>
                  <div className={formFieldStyle} style={{ flex: 1 }}>
                    <label>
                      {trans.__('Port')}{' '}
                      <span className={formOptionalLabel}>
                        {trans.__('optional')}
                      </span>
                    </label>
                    <input
                      placeholder={defaultPort}
                      value={db_port || ''}
                      onChange={this._onChange('db_port')}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Database / Schema */}
          <div className={formGroupStyle}>
            <div className={formFieldStyle}>
              <label>
                {isSqlite
                  ? trans.__('Database file')
                  : trans.__('Database / schema')}
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

          {/* AUTHENTICATION section */}
          {!isSqlite && (
            <>
              <hr className={formDivider} />
              <div className={formSectionTitle}>
                {trans.__('AUTHENTICATION')}
              </div>
              <div className={formGroupStyle}>
                <div className={formRowStyle}>
                  <div className={formFieldStyle}>
                    <label>
                      {trans.__('Username')}{' '}
                      <span className={formOptionalLabel}>
                        {trans.__('optional')}
                      </span>
                    </label>
                    <input
                      placeholder={trans.__('Leave blank for prompt')}
                      value={db_user || ''}
                      onChange={this._onChange('db_user')}
                    />
                  </div>
                  <div className={formFieldStyle}>
                    <label>
                      {trans.__('Password')}{' '}
                      <span className={formOptionalLabel}>
                        {trans.__('optional')}
                      </span>
                    </label>
                    <input
                      type="password"
                      placeholder={trans.__('Leave blank for prompt')}
                      value={db_pass || ''}
                      onChange={this._onChange('db_pass')}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ---- Fixed Bottom Bar ---- */}
        <div className={formBottomBar}>
          {onTest && (
            <button
              className={formBtnTest}
              onClick={this._onTest}
              disabled={testing || submitting}
              type="button"
            >
              {testing
                ? trans.__('Testing...')
                : trans.__('Test connection')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {onCancel && (
            <button
              className={formBtnOutline}
              onClick={onCancel}
              disabled={submitting}
              type="button"
            >
              {trans.__('Cancel')}
            </button>
          )}
          <button
            className={formBtnPrimary}
            onClick={this._onSubmit}
            disabled={submitting || testing}
            type="button"
          >
            {submitting ? trans.__('Creating...') : trans.__('Create')}
          </button>
        </div>
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
      this.setState({
        [key]: event.target.value,
        errmsg: undefined,
        testResult: null
      });
    };

  private _buildConn(): IDBConn | null {
    const { db_type, db_host, db_name, db_id, name: connName } = this.state;
    const { trans } = this.props;

    if (!db_type) {
      this.setState({ errmsg: trans.__('Please select a database type.') });
      return null;
    }
    if (db_type !== '6' && !db_host) {
      this.setState({ errmsg: trans.__('Please enter the host address.') });
      return null;
    }
    if (db_type === '6' && !db_name) {
      this.setState({
        errmsg: trans.__('Please enter the database file path.')
      });
      return null;
    }

    // Auto-generate ID from name if not provided
    let id = db_id || '';
    if (!id && connName) {
      id = connName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    }
    if (!id) {
      id = 'conn_' + Date.now().toString(36);
    }

    const conn: IDBConn = {
      db_id: id,
      db_type: db_type || '2'
    };

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

    return conn;
  }

  private _onSubmit = () => {
    const conn = this._buildConn();
    if (!conn) {
      return;
    }
    this.setState({ submitting: true, errmsg: undefined, testResult: null });
    this.props.onSubmit(conn);
  };

  private _onTest = async () => {
    const conn = this._buildConn();
    if (!conn || !this.props.onTest) {
      return;
    }
    const { trans } = this.props;
    this.setState({ testing: true, testResult: null, testMsg: '' });
    const result = await this.props.onTest(conn);
    if (!result.errmsg) {
      this.setState({
        testing: false,
        testResult: 'success',
        testMsg: trans.__('Connection successful!')
      });
      Notification.success(trans.__('Connection successful!'), {
        autoClose: 5000
      });
    } else {
      this.setState({
        testing: false,
        testResult: 'error',
        testMsg: result.errmsg
      });
      Notification.error(result.errmsg, { autoClose: 8000 });
    }
  };

  setError(msg: string): void {
    this.setState({ submitting: false, errmsg: msg });
  }
}
