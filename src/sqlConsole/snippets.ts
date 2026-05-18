import {
  Completion,
  CompletionContext,
  CompletionResult,
  snippetCompletion
} from '@codemirror/autocomplete';

type SnippetDef = {
  label: string;
  detail: string;
  template: string;
  summary: string;
};

const DEFS: SnippetDef[] = [
  {
    label: 'selw',
    detail: 'SELECT ... WHERE',
    summary: 'Filtered SELECT against a single table.',
    template: 'SELECT ${cols}\nFROM ${table}\nWHERE ${cond};'
  },
  {
    label: 'selj',
    detail: 'SELECT ... JOIN',
    summary: 'Inner-join two tables on a key.',
    template:
      'SELECT ${cols}\nFROM ${table}\nJOIN ${other} ON ${table}.${col} = ${other}.${col};'
  },
  {
    label: 'sela',
    detail: 'SELECT ... LIMIT',
    summary: 'Sampling read: first N rows from a table.',
    template: 'SELECT ${cols}\nFROM ${table}\nLIMIT ${100};'
  },
  {
    label: 'selg',
    detail: 'SELECT ... GROUP BY',
    summary: 'Group + count, ordered by frequency desc.',
    template:
      'SELECT ${cols}, COUNT(*) AS cnt\nFROM ${table}\nGROUP BY ${cols}\nORDER BY cnt DESC;'
  },
  {
    label: 'ins',
    detail: 'INSERT INTO',
    summary: 'Insert a single row with explicit column list.',
    template: 'INSERT INTO ${table} (${cols})\nVALUES (${vals});'
  },
  {
    label: 'upd',
    detail: 'UPDATE ... SET',
    summary: 'Update matching rows. Always include a WHERE!',
    template: 'UPDATE ${table}\nSET ${col} = ${val}\nWHERE ${cond};'
  },
  {
    label: 'del',
    detail: 'DELETE FROM',
    summary: 'Delete matching rows. Always include a WHERE!',
    template: 'DELETE FROM ${table}\nWHERE ${cond};'
  },
  {
    label: 'cte',
    detail: 'WITH cte AS (...)',
    summary: 'Common Table Expression — a named subquery used later in the statement.',
    template:
      'WITH ${cte} AS (\n  SELECT ${cols}\n  FROM ${table}\n)\nSELECT ${cols}\nFROM ${cte};'
  },
  {
    label: 'cas',
    detail: 'CASE WHEN ... END',
    summary: 'Inline conditional expression.',
    template: 'CASE WHEN ${cond} THEN ${then}\n     ELSE ${else}\nEND'
  },
  {
    label: 'crt',
    detail: 'CREATE TABLE',
    summary: 'Skeleton CREATE TABLE with a primary key.',
    template:
      'CREATE TABLE ${table} (\n  id BIGINT PRIMARY KEY,\n  ${col} ${type}\n);'
  }
];

function renderSnippetInfo(def: SnippetDef): () => HTMLElement {
  return () => {
    const root = document.createElement('div');
    root.className = 'jp-sql-doc';

    const title = document.createElement('div');
    title.className = 'jp-sql-doc-title';
    title.textContent = def.detail;
    root.appendChild(title);

    const p = document.createElement('div');
    p.className = 'jp-sql-doc-summary';
    p.textContent = def.summary;
    root.appendChild(p);

    const lbl = document.createElement('div');
    lbl.className = 'jp-sql-doc-example-label';
    lbl.textContent = 'Expands to';
    root.appendChild(lbl);

    const pre = document.createElement('pre');
    pre.className = 'jp-sql-doc-example';
    // Strip the ${...} placeholders for the preview so the example reads
    // naturally; the actual insertion still uses the placeholders.
    pre.textContent = def.template.replace(/\$\{([^}]*)\}/g, (_m, name) =>
      name || '...'
    );
    root.appendChild(pre);

    return root;
  };
}

const SNIPPETS: Completion[] = DEFS.map(def =>
  snippetCompletion(def.template, {
    label: def.label,
    detail: def.detail,
    type: 'snippet',
    info: renderSnippetInfo(def)
  })
);

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
