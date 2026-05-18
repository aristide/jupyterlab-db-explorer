import {
  Completion,
  CompletionResult,
  CompletionSource,
  autocompletion
} from '@codemirror/autocomplete';
import {
  keywordCompletionSource,
  schemaCompletionSource,
  sql
} from '@codemirror/lang-sql';
import { Extension } from '@codemirror/state';

import { ConnType } from '../interfaces';
import { resolveDialect, schemaForDbid } from './dialect';
import { lookupDoc, renderDocInfo } from './docs';
import { snippetCompletionSource } from './snippets';

/** Attach an `info` (rendered HTML panel) to each completion when we have
 *  a documented entry for it. Pure rewrap — the original options are not
 *  mutated. */
function attachDocs(
  result: CompletionResult | null,
  connType: ConnType | null
): CompletionResult | null {
  if (!result) {
    return null;
  }
  const options: Completion[] = result.options.map(opt => {
    if (opt.info) {
      return opt; // snippets bring their own info
    }
    const doc = lookupDoc(opt.label, connType);
    if (!doc) {
      return opt;
    }
    return {
      ...opt,
      info: () => renderDocInfo(opt.label, doc)
    };
  });
  return { ...result, options };
}

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
    const schRes = sch(ctx);
    const schResolved =
      schRes instanceof Promise ? null : (schRes as CompletionResult | null);
    const kwRes = kw(ctx);
    const kwResolved =
      kwRes instanceof Promise ? null : (kwRes as CompletionResult | null);
    return attachDocs(schResolved || kwResolved, dialect.connType);
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
