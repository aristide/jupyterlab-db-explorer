import { format } from 'sql-formatter';

import { resolveDialect, type FormatterLang } from './dialect';

const CONN_HEADER_RE = /^(--\s*conn:.*?)(\r?\n)/;

/**
 * Format the given SQL using the dialect associated with `dbid`. On parse
 * error (sql-formatter throws on unrecognized syntax) the original text is
 * returned unchanged. The `-- conn: <dbid>` magic header on line 0 is
 * preserved verbatim — sql-formatter would otherwise re-flow the comment
 * onto its own block and the console depends on it being on line 0.
 */
export function formatSql(text: string, dbid: string): string {
  if (!text || !text.trim()) {
    return text;
  }

  let header = '';
  let body = text;
  const match = text.match(CONN_HEADER_RE);
  if (match) {
    header = match[1] + match[2];
    body = text.slice(match[0].length);
  }

  const lang: FormatterLang = resolveDialect(dbid).formatter;

  try {
    const out = format(body, {
      language: lang,
      keywordCase: 'upper',
      linesBetweenQueries: 2,
      tabWidth: 2
    });
    return header + out;
  } catch (err) {
    console.warn('[sql-formatter] failed, leaving buffer unchanged', err);
    return text;
  }
}
