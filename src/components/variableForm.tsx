import { TranslationBundle } from '@jupyterlab/translation';
import * as React from 'react';
import { ISqlVar } from '../interfaces';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface IVariableFormProps {
  trans: TranslationBundle;
  /** Present when editing an existing variable; absent when creating. */
  variable?: ISqlVar;
  /** Names already in use — used to block duplicate creates. */
  existingNames: string[];
  onSubmit: (v: ISqlVar) => Promise<string>;
  onCancel: () => void;
}

export interface IVariableFormState {
  name: string;
  value: string;
  description: string;
  submitting: boolean;
  error: string;
}

/**
 * Create / edit form for a single SQL variable. Modeled on ConnForm's d4n-cf
 * structure so it shares the design-system styling.
 */
export class VariableForm extends React.Component<
  IVariableFormProps,
  IVariableFormState
> {
  constructor(props: IVariableFormProps) {
    super(props);
    this.state = {
      name: props.variable?.name ?? '',
      value: props.variable?.value ?? '',
      description: props.variable?.description ?? '',
      submitting: false,
      error: ''
    };
  }

  private get _editing(): boolean {
    return !!this.props.variable;
  }

  render(): React.ReactElement {
    const { trans, onCancel } = this.props;
    const { name, value, description, submitting, error } = this.state;
    const editing = this._editing;

    return (
      <form
        className="d4n-cf d4n-cf--refined d4n-cf--comfortable-density"
        onSubmit={this._onSubmit}
        noValidate
      >
        <header className="d4n-cf__header">
          <div className="d4n-cf__header-row">
            <div className="d4n-cf__icon d4n-cf__icon--var" aria-hidden="true">
              <span className="d4n-var-glyph">{'{·}'}</span>
            </div>
            <div className="d4n-cf__titles">
              <h2 className="d4n-cf__title">
                {editing ? trans.__('Edit variable') : trans.__('New variable')}
              </h2>
              <p className="d4n-cf__subtitle">
                {trans.__('Reference it in SQL as ${%1}.', name || 'name')}
              </p>
            </div>
            <button
              type="button"
              className="d4n-iconbtn d4n-cf__close"
              aria-label={trans.__('Close')}
              onClick={onCancel}
            >
              {this._glyph('close', 16)}
            </button>
          </div>
        </header>

        <div className="d4n-cf__scroll">
          <section className="d4n-cf__sec">
            <div className="d4n-field">
              <div className="d4n-field__head">
                <label htmlFor="var-name" className="d4n-field__label">
                  {trans.__('Name')}
                </label>
              </div>
              <div className="d4n-input-wrap">
                <span className="d4n-input-prefix d4n-mono">$&#123;</span>
                <input
                  id="var-name"
                  className="d4n-input d4n-input--prefixed d4n-mono"
                  value={name}
                  placeholder={trans.__('schema')}
                  onChange={e => this.setState({ name: e.target.value })}
                  disabled={editing}
                  autoComplete="off"
                  autoFocus={!editing}
                />
              </div>
            </div>

            <div className="d4n-field">
              <div className="d4n-field__head">
                <label htmlFor="var-value" className="d4n-field__label">
                  {trans.__('Value')}
                </label>
              </div>
              <input
                id="var-value"
                className="d4n-input"
                value={value}
                placeholder={trans.__('analytics')}
                onChange={e => this.setState({ value: e.target.value })}
                autoComplete="off"
                autoFocus={editing}
              />
            </div>

            <div className="d4n-field">
              <div className="d4n-field__head">
                <label htmlFor="var-desc" className="d4n-field__label">
                  {trans.__('Description')}
                  <span className="d4n-field__optional">
                    {' '}
                    {trans.__('optional')}
                  </span>
                </label>
              </div>
              <input
                id="var-desc"
                className="d4n-input"
                value={description}
                placeholder={trans.__('what this variable is for')}
                onChange={e => this.setState({ description: e.target.value })}
                autoComplete="off"
              />
            </div>
          </section>
        </div>

        <footer className="d4n-cf__footer">
          {error && (
            <div className="d4n-testresult is-error" role="status">
              <span className="d4n-testresult__icon">
                {this._glyph('warn', 14)}
              </span>
              <div className="d4n-testresult__text">{error}</div>
            </div>
          )}
          <div className="d4n-cf__footer-row">
            <div className="d4n-cf__footer-spacer" />
            <button
              type="button"
              className="d4n-btn d4n-btn--secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              {trans.__('Cancel')}
            </button>
            <button
              type="submit"
              className="d4n-btn d4n-btn--primary"
              disabled={submitting}
            >
              {submitting ? trans.__('Saving…') : trans.__('Save')}
            </button>
          </div>
        </footer>
      </form>
    );
  }

  private _onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const { trans, existingNames, onSubmit } = this.props;
    const name = this.state.name.trim();
    const value = this.state.value;

    if (!NAME_RE.test(name)) {
      this.setState({
        error: trans.__(
          'Name must start with a letter or underscore and contain only letters, digits, or underscores.'
        )
      });
      return;
    }
    if (!this._editing && existingNames.indexOf(name) >= 0) {
      this.setState({
        error: trans.__('A variable named "%1" already exists.', name)
      });
      return;
    }
    if (!value) {
      this.setState({ error: trans.__('Value cannot be empty.') });
      return;
    }

    this.setState({ submitting: true, error: '' });
    const err = await onSubmit({
      name,
      value,
      description: this.state.description.trim()
    });
    if (err) {
      this.setState({ submitting: false, error: err });
    }
    // On success the parent unmounts this form.
  };

  private _glyph(
    name: 'var' | 'close' | 'warn',
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
      case 'close':
        return (
          <svg {...common}>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        );
      case 'warn':
        return (
          <svg {...common}>
            <path d="M10 3l8 14H2l8-14z" />
            <path d="M10 8v4M10 14.5v.5" />
          </svg>
        );
    }
  }
}
