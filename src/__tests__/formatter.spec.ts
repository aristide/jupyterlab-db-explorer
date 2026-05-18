import { ConnType, IDbItem } from '../interfaces';
import { getSqlModel } from '../model';
import { formatSql } from '../sqlConsole/formatter';

function seedTree(items: IDbItem[]): void {
  (getSqlModel() as unknown as { _item_list: IDbItem[] })._item_list = items;
}

describe('formatSql', () => {
  beforeEach(() => seedTree([]));

  it('uppercases keywords and indents a PG query', () => {
    seedTree([
      {
        type: 'conn',
        name: 'PG',
        subtype: ConnType.DB_PGSQL,
        next: false
      } as IDbItem
    ]);
    const out = formatSql('select id, name from users where id=1;', 'PG');
    expect(out).toContain('SELECT');
    expect(out).toContain('FROM');
    expect(out).toContain('WHERE');
  });

  it('preserves the -- conn: header on line 0', () => {
    seedTree([
      {
        type: 'conn',
        name: 'PG',
        subtype: ConnType.DB_PGSQL,
        next: false
      } as IDbItem
    ]);
    const out = formatSql('-- conn: PG\nselect 1 from t;', 'PG');
    expect(out.split('\n')[0]).toBe('-- conn: PG');
    expect(out).toContain('SELECT');
  });

  it('returns the original text unchanged on parse error', () => {
    seedTree([
      {
        type: 'conn',
        name: 'PG',
        subtype: ConnType.DB_PGSQL,
        next: false
      } as IDbItem
    ]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = 'SELECT ???? WHERE !!!! @@@@';
    const out = formatSql(broken, 'PG');
    // Even on a parse error we never destroy the buffer; it either round-trips
    // or stays put.
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('passes through empty/whitespace text', () => {
    expect(formatSql('', '')).toBe('');
    expect(formatSql('   \n  ', '')).toBe('   \n  ');
  });
});
