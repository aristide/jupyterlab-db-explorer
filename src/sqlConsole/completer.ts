import { CompletionSource, autocompletion } from '@codemirror/autocomplete';
import {
  keywordCompletionSource,
  schemaCompletionSource,
  sql
} from '@codemirror/lang-sql';
import { Extension } from '@codemirror/state';

import { resolveDialect, schemaForDbid } from './dialect';
import { snippetCompletionSource } from './snippets';

/**
 * A completion source that re-resolves the active dialect + cached schema
 * lazily, so a `setDbid()` on the console takes effect at the very next
 * keystroke without re-creating the editor.
 */
function dynamicSqlSource(getDbid: () => string): CompletionSource {
  return ctx => {
    const dialect = resolveDialect(getDbid());
    const namespace = schemaForDbid(getDbid());
    const kw = keywordCompletionSource(dialect.cm, true);
    const sch = schemaCompletionSource({
      dialect: dialect.cm,
      schema: namespace,
      upperCaseKeywords: true
    });
    return sch(ctx) || kw(ctx);
  };
}

/**
 * Build the CM6 extension that powers SQL autocompletion for the SQL console
 * editor: dialect-aware keywords + functions, schema items from the loaded
 * SqlModel tree, and a small set of generic snippets.
 */
export function buildSqlCompleter(getDbid: () => string): Extension {
  return [
    // Base SQL language support — pins the parser. The dynamic source below
    // takes over completion; `sql()` itself still wires syntax/indent.
    sql({ dialect: resolveDialect('').cm, upperCaseKeywords: true }),
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: 50,
      override: [dynamicSqlSource(getDbid), snippetCompletionSource]
    })
  ];
}
