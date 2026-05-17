import * as React from 'react';
import { TranslationBundle } from '@jupyterlab/translation';
import { Notification } from '@jupyterlab/apputils';
import { IDBConn, ConnType } from '../interfaces';

// Brand SVG strings — masked into the pill's colored swatch.
import postgresSvg from '../../style/db-icons/postgresql.svg';
import mysqlSvg from '../../style/db-icons/mysql.svg';
import sqliteSvg from '../../style/db-icons/sqlite.svg';
import oracleSvg from '../../style/db-icons/oracle.svg';
import hiveSvg from '../../style/db-icons/apachehive.svg';
import trinoSvg from '../../style/db-icons/trino.svg';
import starrocksSvg from '../../style/db-icons/starrocks.svg';
import sqlserverSvg from '../../style/db-icons/microsoftsqlserver.svg';

function svgToDataUrl(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

type DbTypeEntry = {
  value: string;        // numeric ConnType code as a string
  label: string;
  defaultPort: string;
  swatch: string;
  mono: string;
  glyphUrl: string;
  hostHint: string;
  filePath?: boolean;
};

const DB_TYPES: DbTypeEntry[] = [
  {
    value: String(ConnType.DB_PGSQL),
    label: 'PostgreSQL',
    defaultPort: '5432',
    swatch: '#336791',
    mono: 'PG',
    glyphUrl: svgToDataUrl(postgresSvg),
    hostHint: 'e.g. db.example.com'
  },
  {
    value: String(ConnType.DB_MYSQL),
    label: 'MySQL',
    defaultPort: '3306',
    swatch: '#E48E00',
    mono: 'MY',
    glyphUrl: svgToDataUrl(mysqlSvg),
    hostHint: 'e.g. mysql.example.com'
  },
  {
    value: String(ConnType.DB_SQLSERVER),
    label: 'SQL Server',
    defaultPort: '1433',
    swatch: '#A91D22',
    mono: 'MS',
    glyphUrl: svgToDataUrl(sqlserverSvg),
    hostHint: 'e.g. mssql.example.com'
  },
  {
    value: String(ConnType.DB_SQLITE),
    label: 'SQLite',
    defaultPort: '',
    swatch: '#003B57',
    mono: 'SQ',
    glyphUrl: svgToDataUrl(sqliteSvg),
    hostHint: 'Path to .db file',
    filePath: true
  },
  {
    value: String(ConnType.DB_ORACLE),
    label: 'Oracle',
    defaultPort: '1521',
    swatch: '#C74634',
    mono: 'OR',
    glyphUrl: svgToDataUrl(oracleSvg),
    hostHint: 'e.g. oracle.example.com'
  },
  {
    value: String(ConnType.DB_HIVE_LDAP),
    label: 'Hive',
    defaultPort: '10000',
    swatch: '#FDB813',
    mono: 'HV',
    glyphUrl: svgToDataUrl(hiveSvg),
    hostHint: 'HiveServer2 host'
  },
  {
    value: String(ConnType.DB_TRINO),
    label: 'Trino',
    defaultPort: '8080',
    swatch: '#DD00A1',
    mono: 'TR',
    glyphUrl: svgToDataUrl(trinoSvg),
    hostHint: 'Trino coordinator host'
  },
  {
    value: String(ConnType.DB_STARROCKS),
    label: 'StarRocks',
    defaultPort: '9030',
    swatch: '#1FA0A0',
    mono: 'SR',
    glyphUrl: svgToDataUrl(starrocksSvg),
    hostHint: 'FE host (query port)'
  }
];

function findType(value: string | undefined): DbTypeEntry {
  return DB_TYPES.find(t => t.value === value) || DB_TYPES[0];
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

interface IConnFormProps {
  trans: TranslationBundle;
  conn?: Partial<IDBConn>;
  onSubmit: (conn: IDBConn) => void;
  onCancel?: () => void;
  onTest?: (conn: IDBConn) => Promise<IDBConn>;
  allowedTypes?: string[] | null;
  vaultEnabled?: boolean;
}

type TAuthMode = 'direct' | 'vault';
type TTestState = 'idle' | 'loading' | 'success' | 'error';

interface IConnFormState extends Partial<IDBConn> {
  submitting?: boolean;
  authMode?: TAuthMode;
  showPwd?: boolean;
  testState?: TTestState;
  testMsg?: string;
  /** db_id has been edited manually — stop auto-slugging from name. */
  idTouched?: boolean;
  /** db_port has been edited manually — stop replacing it with the default
   *  when the user picks a different DB type. */
  portTouched?: boolean;
}

export class ConnForm extends React.Component<IConnFormProps, IConnFormState> {
  constructor(props: IConnFormProps) {
    super(props);
    const initial = { db_type: String(ConnType.DB_PGSQL), db_id: '', ...this.props.conn };
    const initialAuth: TAuthMode =
      props.vaultEnabled &&
      typeof initial.db_user === 'string' &&
      initial.db_user.startsWith('vault://')
        ? 'vault'
        : 'direct';
    this.state = {
      ...initial,
      submitting: false,
      authMode: initialAuth,
      showPwd: false,
      testState: 'idle',
      testMsg: '',
      idTouched: !!initial.db_id,
      portTouched: !!initial.db_port
    };
  }

  render(): React.ReactElement {
    const { trans, allowedTypes, vaultEnabled, onCancel, onTest } = this.props;
    const {
      db_id,
      db_type,
      db_name,
      db_host,
      db_port,
      db_user,
      db_pass,
      name,
      submitting,
      authMode,
      showPwd,
      testState,
      testMsg
    } = this.state;

    const useVault = !!vaultEnabled && authMode === 'vault';
    const visibleTypes =
      allowedTypes && allowedTypes.length > 0
        ? DB_TYPES.filter(t => allowedTypes.includes(t.value))
        : DB_TYPES;
    const currentType = findType(db_type);
    const isFilePath = !!currentType.filePath;
    const portPlaceholder = currentType.defaultPort || '';

    return (
      <form
        className="d4n-cf d4n-cf--refined d4n-cf--comfortable-density"
        onSubmit={this._onSubmitForm}
        noValidate
      >
        <header className="d4n-cf__header">
          <div className="d4n-cf__header-row">
            <div className="d4n-cf__icon">{this._glyph('db', 18)}</div>
            <div className="d4n-cf__titles">
              <h2 className="d4n-cf__title">{trans.__('New connection')}</h2>
              <p className="d4n-cf__subtitle">
                {trans.__('Configure database credentials for the explorer.')}
              </p>
            </div>
            {onCancel && (
              <button
                type="button"
                className="d4n-iconbtn d4n-cf__close"
                aria-label={trans.__('Close')}
                onClick={onCancel}
              >
                {this._glyph('close', 16)}
              </button>
            )}
          </div>
        </header>

        <div className="d4n-cf__scroll">
          {/* Identity */}
          <section className="d4n-cf__sec">
            <div className="d4n-cf__grid">
              <div className="d4n-field">
                <div className="d4n-field__head">
                  <label htmlFor="cn-name" className="d4n-field__label">
                    {trans.__('Connection name')}
                  </label>
                </div>
                <input
                  id="cn-name"
                  className="d4n-input"
                  value={name || ''}
                  placeholder={trans.__('production-db')}
                  onChange={this._onNameChange}
                  autoComplete="off"
                />
              </div>
              <div className="d4n-field">
                <div className="d4n-field__head">
                  <label htmlFor="cn-id" className="d4n-field__label">
                    {trans.__('Identifier')}
                    <span className="d4n-field__optional">
                      {' '}
                      {trans.__('optional')}
                    </span>
                  </label>
                </div>
                <div className="d4n-input-wrap">
                  <span className="d4n-input-prefix d4n-mono">id:</span>
                  <input
                    id="cn-id"
                    className="d4n-input d4n-input--prefixed d4n-mono"
                    value={db_id || ''}
                    placeholder={trans.__('auto-generated')}
                    onChange={this._onIdChange}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* DB type */}
          <section className="d4n-cf__sec">
            <div className="d4n-field">
              <div className="d4n-field__head">
                <label className="d4n-field__label">
                  {trans.__('Database type')}
                </label>
              </div>
              <div
                className="d4n-dbpills"
                role="radiogroup"
                aria-label={trans.__('Database type')}
              >
                {visibleTypes.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={t.value === db_type}
                    className={`d4n-dbpill${t.value === db_type ? ' is-selected' : ''}`}
                    onClick={() => this._onPickType(t)}
                  >
                    <span
                      className="d4n-dbpill__dot"
                      style={{ background: t.swatch }}
                      aria-hidden="true"
                    >
                      <span
                        className="d4n-dbpill__badge"
                        data-icon
                        style={{ ['--db-icon' as string]: t.glyphUrl }}
                      />
                    </span>
                    <span className="d4n-dbpill__label">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Server */}
          <section className="d4n-cf__sec d4n-cf__sec--block">
            <div className="d4n-sechead">
              <div className="d4n-sechead__row">
                <span className="d4n-sechead__eyebrow">{trans.__('Server')}</span>
                <span className="d4n-sechead__hint">
                  {isFilePath
                    ? trans.__('SQLite is file-based')
                    : trans.__('Where the database lives')}
                </span>
              </div>
            </div>
            {isFilePath ? (
              <div className="d4n-cf__grid">
                <div className="d4n-field d4n-span-2">
                  <div className="d4n-field__head">
                    <label htmlFor="cn-file" className="d4n-field__label">
                      {trans.__('Database file')}
                    </label>
                  </div>
                  <input
                    id="cn-file"
                    className="d4n-input d4n-mono"
                    value={db_name || ''}
                    placeholder={trans.__('Path to .db file')}
                    onChange={this._onChange('db_name')}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="d4n-cf__grid d4n-cf__grid--3-2">
                  <div className="d4n-field d4n-span-2">
                    <div className="d4n-field__head">
                      <label htmlFor="cn-host" className="d4n-field__label">
                        {trans.__('Host')}
                      </label>
                    </div>
                    <input
                      id="cn-host"
                      className="d4n-input d4n-mono"
                      value={db_host || ''}
                      placeholder={trans.__(currentType.hostHint)}
                      onChange={this._onChange('db_host')}
                      autoComplete="off"
                    />
                  </div>
                  <div className="d4n-field">
                    <div className="d4n-field__head">
                      <label htmlFor="cn-port" className="d4n-field__label">
                        {trans.__('Port')}
                        <span className="d4n-field__optional">
                          {' '}
                          {trans.__('optional')}
                        </span>
                      </label>
                    </div>
                    <input
                      id="cn-port"
                      className="d4n-input d4n-mono"
                      value={db_port || ''}
                      placeholder={portPlaceholder}
                      inputMode="numeric"
                      onChange={this._onPortChange}
                    />
                  </div>
                </div>
                <div className="d4n-cf__grid">
                  <div className="d4n-field d4n-span-2">
                    <div className="d4n-field__head">
                      <label htmlFor="cn-db" className="d4n-field__label">
                        {trans.__('Database / schema')}
                        <span className="d4n-field__optional">
                          {' '}
                          {trans.__('optional')}
                        </span>
                      </label>
                    </div>
                    <input
                      id="cn-db"
                      className="d4n-input d4n-mono"
                      value={db_name || ''}
                      placeholder={trans.__('Leave blank to browse all')}
                      onChange={this._onChange('db_name')}
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Authentication */}
          {!isFilePath && (
            <section className="d4n-cf__sec d4n-cf__sec--block">
              <div className="d4n-sechead">
                <div className="d4n-sechead__row">
                  <span className="d4n-sechead__eyebrow">
                    {trans.__('Authentication')}
                  </span>
                  <span className="d4n-sechead__hint">
                    {useVault
                      ? trans.__('Resolved at runtime from Vault')
                      : trans.__('Stored in the user keyring')}
                  </span>
                </div>
              </div>

              {vaultEnabled && (
                <div className="d4n-field">
                  <div className="d4n-field__head">
                    <label className="d4n-field__label">
                      {trans.__('Credential source')}
                    </label>
                  </div>
                  <div className="d4n-dbpills" role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={authMode === 'direct'}
                      className={`d4n-dbpill${authMode === 'direct' ? ' is-selected' : ''}`}
                      onClick={() => this._setAuthMode('direct')}
                    >
                      <span className="d4n-dbpill__label">
                        {trans.__('Credentials')}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={authMode === 'vault'}
                      className={`d4n-dbpill${authMode === 'vault' ? ' is-selected' : ''}`}
                      onClick={() => this._setAuthMode('vault')}
                    >
                      <span className="d4n-dbpill__label">
                        {trans.__('Vault reference')}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="d4n-cf__grid">
                <div className="d4n-field">
                  <div className="d4n-field__head">
                    <label htmlFor="cn-user" className="d4n-field__label">
                      {useVault
                        ? trans.__('Username Vault URL')
                        : trans.__('Username')}
                      <span className="d4n-field__optional">
                        {' '}
                        {trans.__('optional')}
                      </span>
                    </label>
                  </div>
                  <input
                    id="cn-user"
                    className="d4n-input d4n-mono"
                    value={db_user || ''}
                    placeholder={
                      useVault
                        ? 'vault://path/to/secret#username'
                        : trans.__('Leave blank for prompt')
                    }
                    autoComplete="off"
                    onChange={this._onChange('db_user')}
                  />
                </div>
                <div className="d4n-field">
                  <div className="d4n-field__head">
                    <label htmlFor="cn-pwd" className="d4n-field__label">
                      {useVault
                        ? trans.__('Password Vault URL')
                        : trans.__('Password')}
                      <span className="d4n-field__optional">
                        {' '}
                        {trans.__('optional')}
                      </span>
                    </label>
                  </div>
                  <div className="d4n-input-wrap">
                    <input
                      id="cn-pwd"
                      type={useVault || showPwd ? 'text' : 'password'}
                      className="d4n-input d4n-input--suffixed d4n-mono"
                      value={db_pass || ''}
                      placeholder={
                        useVault
                          ? 'vault://path/to/secret#password'
                          : trans.__('Leave blank for prompt')
                      }
                      autoComplete="new-password"
                      onChange={this._onChange('db_pass')}
                    />
                    {!useVault && (
                      <button
                        type="button"
                        className="d4n-input-suffix"
                        onClick={() =>
                          this.setState({ showPwd: !showPwd })
                        }
                        aria-label={
                          showPwd
                            ? trans.__('Hide password')
                            : trans.__('Show password')
                        }
                        tabIndex={-1}
                      >
                        {this._glyph(showPwd ? 'eye-off' : 'eye', 14)}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {useVault && (
                <div className="d4n-field__msg">
                  {trans.__(
                    'Format: vault://<path>#<field> — resolved by the server at connect time.'
                  )}
                </div>
              )}
            </section>
          )}

          <div className="d4n-cf__scroll-end" aria-hidden="true" />
        </div>

        {/* Footer */}
        <footer className="d4n-cf__footer">
          {testState !== 'idle' && (
            <div
              className={
                'd4n-field__msg' +
                (testState === 'error' ? ' d4n-field__msg--err' : '')
              }
              role="status"
              style={{ marginBottom: 8 }}
            >
              {testState === 'loading' && trans.__('Testing connection…')}
              {testState === 'success' &&
                (testMsg || trans.__('Connection successful.'))}
              {testState === 'error' &&
                (testMsg || trans.__('Could not connect.'))}
            </div>
          )}
          <div className="d4n-cf__footer-row">
            {onTest && (
              <button
                type="button"
                className="d4n-btn d4n-btn--ghost"
                onClick={this._onTest}
                disabled={testState === 'loading' || submitting}
              >
                {testState === 'loading'
                  ? trans.__('Testing…')
                  : trans.__('Test connection')}
              </button>
            )}
            <div className="d4n-cf__footer-spacer" />
            {onCancel && (
              <button
                type="button"
                className="d4n-btn d4n-btn--secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                {trans.__('Cancel')}
              </button>
            )}
            <button
              type="submit"
              className="d4n-btn d4n-btn--primary"
              disabled={submitting || testState === 'loading'}
            >
              {submitting ? trans.__('Creating…') : trans.__('Create')}
            </button>
          </div>
        </footer>
      </form>
    );
  }

  // ─── Inline glyphs (small subset of design's Icon) ────────────────────
  private _glyph(name: string, size = 16): React.ReactElement {
    const p = {
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
      case 'db':
        return (
          <svg {...p}>
            <ellipse cx="10" cy="5" rx="5.5" ry="2" />
            <path d="M4.5 5v10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V5" />
            <path d="M4.5 10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" />
          </svg>
        );
      case 'close':
        return (
          <svg {...p}>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        );
      case 'eye':
        return (
          <svg {...p}>
            <path d="M1.8 10s2.9-5.5 8.2-5.5S18.2 10 18.2 10 15.3 15.5 10 15.5 1.8 10 1.8 10z" />
            <circle cx="10" cy="10" r="2.4" />
          </svg>
        );
      case 'eye-off':
        return (
          <svg {...p}>
            <path d="M3 3l14 14" />
            <path d="M7.2 6.4C4.6 7.7 1.8 10 1.8 10S4.7 15.5 10 15.5c1.6 0 3-.4 4.1-1" />
            <path d="M9 5.6c.33-.06.66-.1 1-.1 5.3 0 8.2 5.5 8.2 5.5-.4.78-1 1.7-1.86 2.6" />
            <path d="M11.7 11.7a2.4 2.4 0 01-3.4-3.4" />
          </svg>
        );
      default:
        return <svg {...p} />;
    }
  }

  // ─── Field handlers ─────────────────────────────────────────────────
  private _onNameChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const v = ev.target.value;
    this.setState(prev => {
      const next: Partial<IConnFormState> = { name: v, testState: 'idle' };
      if (!prev.idTouched) {
        next.db_id = slugify(v);
      }
      return next as IConnFormState;
    });
  };

  private _onIdChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const v = slugify(ev.target.value);
    this.setState({ db_id: v, idTouched: true, testState: 'idle' });
  };

  private _onPortChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const v = ev.target.value.replace(/[^\d]/g, '').slice(0, 5);
    this.setState({ db_port: v, portTouched: true, testState: 'idle' });
  };

  private _onPickType = (t: DbTypeEntry): void => {
    this.setState(prev => {
      const next: Partial<IConnFormState> = {
        db_type: t.value,
        testState: 'idle'
      };
      if (!prev.portTouched) {
        next.db_port = t.defaultPort;
      }
      return next as IConnFormState;
    });
  };

  private _onChange =
    (key: keyof IDBConn) =>
    (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      this.setState({
        [key]: ev.target.value,
        testState: 'idle'
      } as IConnFormState);
    };

  private _setAuthMode = (mode: TAuthMode): void => {
    this.setState(prev => {
      if (prev.authMode === mode) {
        return null as unknown as IConnFormState;
      }
      return {
        authMode: mode,
        db_user: '',
        db_pass: '',
        testState: 'idle'
      } as IConnFormState;
    });
  };

  // ─── Build IDBConn from current state ───────────────────────────────
  private _buildConn(): IDBConn | null {
    const { db_type, db_host, db_name, db_id, name: connName } = this.state;
    const { trans } = this.props;
    if (!db_type) {
      this.setState({
        testState: 'error',
        testMsg: trans.__('Please select a database type.')
      });
      return null;
    }
    const isFilePath = findType(db_type).filePath;
    if (!isFilePath && !db_host) {
      this.setState({
        testState: 'error',
        testMsg: trans.__('Please enter the host address.')
      });
      return null;
    }
    if (isFilePath && !db_name) {
      this.setState({
        testState: 'error',
        testMsg: trans.__('Please enter the database file path.')
      });
      return null;
    }

    let id = db_id || '';
    if (!id && connName) {
      id = slugify(connName);
    }
    if (!id) {
      id = 'conn_' + Date.now().toString(36);
    }

    const conn: IDBConn = { db_id: id, db_type };
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
        (conn as unknown as Record<string, unknown>)[f] = val;
      }
    }
    return conn;
  }

  // ─── Submit / test ──────────────────────────────────────────────────
  private _onSubmitForm = (ev: React.FormEvent<HTMLFormElement>): void => {
    ev.preventDefault();
    const conn = this._buildConn();
    if (!conn) {
      return;
    }
    this.setState({ submitting: true, testState: 'idle' });
    this.props.onSubmit(conn);
  };

  private _onTest = async (): Promise<void> => {
    const conn = this._buildConn();
    if (!conn || !this.props.onTest) {
      return;
    }
    const { trans } = this.props;
    this.setState({ testState: 'loading', testMsg: '' });
    try {
      const result = await this.props.onTest(conn);
      if (!result.errmsg) {
        this.setState({
          testState: 'success',
          testMsg: trans.__('Connection successful.')
        });
        Notification.success(trans.__('Connection successful!'), {
          autoClose: 5000
        });
      } else {
        this.setState({ testState: 'error', testMsg: result.errmsg });
        Notification.error(result.errmsg, { autoClose: 8000 });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : trans.__('Connection test failed.');
      this.setState({ testState: 'error', testMsg: msg });
      Notification.error(msg, { autoClose: 8000 });
    }
  };

  setError(msg: string): void {
    this.setState({ submitting: false, testState: 'error', testMsg: msg });
  }
}
