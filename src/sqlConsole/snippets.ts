import {
  Completion,
  CompletionContext,
  CompletionResult,
  snippetCompletion
} from '@codemirror/autocomplete';

const SNIPPETS: Completion[] = [
  snippetCompletion('SELECT ${cols}\nFROM ${table}\nWHERE ${cond};', {
    label: 'selw',
    detail: 'SELECT ... WHERE',
    type: 'snippet'
  }),
  snippetCompletion(
    'SELECT ${cols}\nFROM ${table}\nJOIN ${other} ON ${table}.${col} = ${other}.${col};',
    { label: 'selj', detail: 'SELECT ... JOIN', type: 'snippet' }
  ),
  snippetCompletion('SELECT ${cols}\nFROM ${table}\nLIMIT ${100};', {
    label: 'sela',
    detail: 'SELECT ... LIMIT',
    type: 'snippet'
  }),
  snippetCompletion(
    'SELECT ${cols}, COUNT(*) AS cnt\nFROM ${table}\nGROUP BY ${cols}\nORDER BY cnt DESC;',
    { label: 'selg', detail: 'SELECT ... GROUP BY', type: 'snippet' }
  ),
  snippetCompletion(
    'INSERT INTO ${table} (${cols})\nVALUES (${vals});',
    { label: 'ins', detail: 'INSERT INTO', type: 'snippet' }
  ),
  snippetCompletion(
    'UPDATE ${table}\nSET ${col} = ${val}\nWHERE ${cond};',
    { label: 'upd', detail: 'UPDATE ... SET', type: 'snippet' }
  ),
  snippetCompletion('DELETE FROM ${table}\nWHERE ${cond};', {
    label: 'del',
    detail: 'DELETE FROM',
    type: 'snippet'
  }),
  snippetCompletion(
    'WITH ${cte} AS (\n  SELECT ${cols}\n  FROM ${table}\n)\nSELECT ${cols}\nFROM ${cte};',
    { label: 'cte', detail: 'WITH cte AS (...)', type: 'snippet' }
  ),
  snippetCompletion(
    'CASE WHEN ${cond} THEN ${then}\n     ELSE ${else}\nEND',
    { label: 'cas', detail: 'CASE WHEN ... END', type: 'snippet' }
  ),
  snippetCompletion(
    'CREATE TABLE ${table} (\n  id BIGINT PRIMARY KEY,\n  ${col} ${type}\n);',
    { label: 'crt', detail: 'CREATE TABLE', type: 'snippet' }
  )
];

export function snippetCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }
  return {
    from: word.from,
    options: SNIPPETS,
    validFor: /^[A-Za-z_]\w*$/
  };
}
