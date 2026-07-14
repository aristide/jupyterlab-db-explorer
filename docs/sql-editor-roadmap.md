# SQL Editor — Improvement & Feature Roadmap

Audience: a lakehouse platform (Trino / StarRocks / Hive at the core, plus classic RDBMS) serving **two personas in one tool**:

- **The analyst who doesn't live in SQL** — wants answers, fears the blank editor, doesn't know the catalog.
- **The power user** — wants speed, keyboard flow, plans, and zero ceremony. Will abandon any tool that adds friction over DBeaver or the Trino CLI.

The product bet is that a JupyterLab-native editor can beat both: it sits where the data work already happens (notebooks), and it can hand results straight into Python. Everything below is argued against that bet.

## What makes a query editor "addicting"

Retention in developer tools comes from three loops, in this order:

1. **Fast feedback** — the time from "I wonder" to "I see rows" must feel instant. Every 100 ms of perceived latency, every extra click between editing and seeing results, bleeds engagement. We already stream results through a server-side cursor with a page cache — the foundation is right; the gaps are in the _interaction_ path (shortcuts, statement targeting, long-query handling).
2. **Zero loss** — nothing the user writes or discovers may ever disappear. Closed tab, crashed kernel, expired session: if a query or a result is gone, trust is gone. Today nothing is persisted except `.sql` files the user explicitly saves. This is our single biggest retention hole.
3. **Progressive disclosure** — beginners get scaffolding (click-to-query, guardrails, explanations); experts get density (shortcuts, plans, raw speed). The same surface, two depths. The column-profile header already does this well — it teaches data shape without being asked.

The roadmap below is grouped by those loops, with a lakehouse-specific section, and ends with a prioritized table.

---

## 1. Quick wins (days each — do these first)

### 1.1 Wire `Ctrl+Enter` / `Shift+Enter` to run

The keydown handler exists in `src/sqlConsole/editor.ts` but is **commented out** — today the only way to run is the toolbar button. This is table stakes: every SQL tool on earth runs on Ctrl+Enter, and muscle memory is the cheapest addiction mechanism there is. Wire it through the existing CM6 `keymap` extension (like the Shift+Alt+F formatter binding), add `Ctrl+Shift+Enter` for "run all statements".

### 1.2 Highlight the statement that will run

The editor already segments by semicolon (`Editor.sql` / `findSegment`) to decide what executes — but the user can't _see_ the segment boundary. A subtle background tint on the active statement removes the #1 beginner surprise ("it ran the wrong query") at near-zero cost: the segmentation logic already exists, it only needs a CM6 decoration.

### 1.3 `${name}` variable autocomplete

Variables exist end-to-end (panel, store, server-side resolution) but the editor doesn't suggest them. Add a completion source listing defined variables (one `get_variables()` fetch, refreshed on `variables_changed`). Without this, variables are a feature users must _remember_; with it, they're a feature users _discover_ — the completion popup is the advertisement.

### 1.4 Export results: CSV / clipboard / **pandas DataFrame**

Today the grid only has Lumino's copy-selection. Three exports, in value order:

1. **"Open as DataFrame"** — inject `df = %sql_result <taskid>`-style code (or write a parquet temp file and emit `pd.read_parquet(...)`) into a new notebook cell. _This is the JupyterLab killer feature_: no other SQL client can end with a DataFrame in your active kernel. It converts every query into a reason to stay in the platform.
2. **Download CSV** — server already holds the cursor/page-cache; add a `/query/export` endpoint that streams it.
3. **Copy column / copy as INSERT/markdown** from the column header popover.

### 1.5 Auto-`LIMIT` guardrail (beginner default, expert toggle)

On a lakehouse, `SELECT * FROM fact_events` is not a typo — it's a bill and ten wasted minutes. When a statement has no `LIMIT`/`FETCH`, wrap it (or warn) with a configurable default (e.g. 10 000 — the streaming cursor's hard cap `DB_EXPLORER_QUERY_LIMIT` already exists server-side; surface it in the UI). Show a small "limited to 10 000 — run unlimited" chip on the result so experts can opt out per-query. Guardrails that are visible and reversible teach instead of patronize.

---

## 2. Zero loss — the retention backbone (highest strategic priority)

### 2.1 Query history (automatic, searchable, per-connection)

Every executed statement gets recorded: SQL text, connection, timestamp, duration, row count, success/error. A history tab (or palette) with full-text search and one-click re-run/insert.

**Argument:** history is the single highest-retention feature any query tool ships. It removes the fear of experimenting ("I can always get it back"), it is the beginner's personal snippet library built without effort, and for the expert it replaces the `.sql` scratch-file mess. Implementation is cheap: the backend already sees every statement in `QueryHandler.post` — append to a capped JSONL in `~/.database/history/` and add one list/search endpoint. The variables store (`variables.py`) is the exact pattern to copy.

### 2.2 Autosaved scratch drafts

Untitled consoles currently lose content on close. Persist every console buffer (debounced) to a drafts area and offer "reopen last session". Pairs with history: history covers what _ran_, drafts cover what was _being written_.

### 2.3 Saved snippets / team queries

A "Snippets" collection next to Variables: name + SQL + description, insertable from the completion menu (the CM6 snippet infrastructure in `snippets.ts` already exists — feed it user snippets, not just the static ones). The existing shared-comments mechanism (`comments_store = database::...`) shows the path to make these **team-shared** later: a lakehouse team's tribal knowledge ("the canonical sessionization query") living in the editor is a moat.

---

## 3. Fast feedback on a lakehouse (where engines are slow by nature)

### 3.1 Background queries + notifications

Trino/Hive queries routinely run minutes. Today the console blocks on one query (`_is_running` flag) and the result is owned by the open widget. Decouple: queries are tasks (the backend _already_ runs them as task-store tasks with task ids); let the user fire a query, keep editing, and get a JupyterLab `Notification` when it lands — click to focus the result.

**Argument:** this converts "wait, alt-tab, forget" into "fire and keep flowing", which is exactly the feedback-loop preservation that keeps people in the tool for hours. Most of the machinery (async task store, RETRY polling, taskids) exists; this is UI orchestration, not new infrastructure.

### 3.2 EXPLAIN / query-plan view

A "plan" button that runs the dialect-correct `EXPLAIN` (the dialect registry in `dialect.ts` knows the engine) and renders stages/estimated rows. Start with formatted text + cost highlights; a graphical tree later. For experts this is the difference between a toy and a tool; for beginners, "this query scans 2.1 TB" _before_ running is the best SQL teacher there is — and on a pay-per-scan lakehouse it's also a cost feature.

### 3.3 Cancel that actually cancels + progress

`stop()` exists, but long Trino queries deserve visible progress (Trino exposes completed/total splits). Even a coarse progress bar transforms the perceived latency of a 3-minute query.

### 3.4 Multiple result tabs / pinned results

One console = one result today; running a second query destroys the first. Allow pinning a result (it's just a taskid + cached pages server-side) and tabbing between result sets. Comparing "before/after" of a WHERE change is the most common analyst loop there is; forcing them to screenshot the old result is silent churn.

---

## 4. Beginner scaffolding (progressive disclosure, not a separate mode)

### 4.1 Friendly error diagnostics, mapped into the editor

Engine errors are cryptic (`TrinoUserError: line 3:8: Column 'usrid' cannot be resolved`). Two layers:

1. Parse line/column from the error and underline the offending span in CM6 (mechanical, dialect-specific regexes).
2. A "did you mean" pass: for unresolved columns/tables, fuzzy-match against the schema already cached for autocomplete and suggest the fix.

**Argument:** beginners don't abandon SQL because it's hard — they abandon it because errors don't say what to do next. We already hold the schema in memory for the completer; using it to answer "did you mean `user_id`?" is high leverage on existing assets.

### 4.2 Click-to-scaffold from the tree (extend what's there)

"Open Console" on a table already emits a `SELECT`. Extend the menu: _Preview 100 rows_, _Count rows_, _Describe columns_, _Profile table_ (reusing the column-profile machinery). Each is one click from tree to insight — the beginner's first dopamine hit without typing a single keyword.

### 4.3 Global catalog search

Lakehouse catalogs have thousands of tables across schemas; the sidebar filter only searches _loaded_ nodes. A search box that queries `information_schema` server-side (tables + columns + comments — the comments feature finally pays off) and jumps the tree. "Where is revenue stored?" is the first question every new user asks; answering it inside the tool is the difference between adoption and a Slack message.

### 4.4 Optional AI assist (NL → SQL, explain, fix) — deliberately scoped

JupyterLab users increasingly expect it, and for the non-SQL persona it's the bridge feature. Scope it tightly to keep trust:

- _Explain this query_ and _fix this error_ first (low risk, grounded in visible text).
- _NL → SQL_ second, always generating **into the editor for review**, never auto-running, with the live schema as context.
- Bring-your-own endpoint (env-configured), off by default — a lakehouse platform sells to enterprises; an opt-in design is a feature, not a limitation.

**Argument for including it at all:** the column profiles, schema cache, and dialect registry mean we can ground generation far better than a generic chatbot can — grounded context is the actual product advantage, the LLM is a commodity.

---

## 5. Jupyter-native superpowers (the moat)

### 5.1 Chart shelf on results

`interfaces.ts` already reserves dtypes "for the stats sub-row + chart-shelf" — finish the thought. One-click bar/line/scatter from the result (column dtypes are known; histogram/top-N endpoints already exist for aggregation). Not a BI tool — a _glance_ tool: 80 % of analyst charting is "show me this grouped by that", and keeping it in-panel keeps the loop fast. Export the chart spec to a notebook cell for the remaining 20 %.

### 5.2 Variables, levelled up

The `${name}` system is the seed of parametrized analytics:

- **Typed variables** (date, number, enum) → the insert UI becomes a date-picker or dropdown instead of raw text.
- **Run-time prompt**: a query referencing an undefined `${region}` could prompt inline instead of erroring — turning any saved query into a mini-app a beginner can run safely.
- This is how a saved expert query becomes a reusable tool for the rest of the team — the two personas feeding each other is the platform's compounding loop.

### 5.3 Command palette + keyboard everything

Register console actions (run, format, export, switch connection, insert variable/snippet) as JupyterLab commands so they appear in the palette and are rebindable. Cheap (the command registry is right there in `cmd_menu.ts`) and it's what makes experts feel at home.

---

## 6. Explicitly deprioritized (and why)

- **Full visual query builder** — high cost, low ceiling; click-to-scaffold + AI assist + completion cover the same need with less UI to maintain.
- **In-editor schema management (DDL designers)** — lakehouse schemas are owned by pipelines, not by an editor; read-path excellence is the product.
- **Real-time collaboration on queries** — wait for demand; shared snippets deliver most of the value at 5 % of the complexity.

---

## Prioritized roadmap

| #   | Feature                              | Loop           | Persona  | Effort | Leverage on existing code                |
| --- | ------------------------------------ | -------------- | -------- | ------ | ---------------------------------------- |
| 1   | Ctrl+Enter run + run-all             | Fast feedback  | Both     | XS     | keymap pattern exists (formatter)        |
| 2   | Active-statement highlight           | Fast feedback  | Beginner | XS     | segmentation logic exists                |
| 3   | `${name}` autocomplete               | Discovery      | Both     | XS     | completer + variables API exist          |
| 4   | Query history                        | Zero loss      | Both     | S      | copy `variables.py` store pattern        |
| 5   | Export: DataFrame / CSV              | Jupyter moat   | Both     | S      | cursor + page cache exist                |
| 6   | Auto-LIMIT guardrail                 | Lakehouse cost | Beginner | S      | `DB_EXPLORER_QUERY_LIMIT` exists         |
| 7   | Background queries + notifications   | Fast feedback  | Expert   | M      | async task store exists                  |
| 8   | Error diagnostics + did-you-mean     | Scaffolding    | Beginner | M      | schema cache exists                      |
| 9   | Catalog search                       | Scaffolding    | Both     | M      | tree + comments backend exist            |
| 10  | EXPLAIN view                         | Fast feedback  | Expert   | M      | dialect registry exists                  |
| 11  | Saved snippets (then team-shared)    | Zero loss      | Both     | M      | snippets.ts + comments_store pattern     |
| 12  | Result tabs / pinning                | Fast feedback  | Both     | M      | results are server-side taskids          |
| 13  | Chart shelf                          | Jupyter moat   | Both     | M/L    | dtypes + histogram/top-N endpoints exist |
| 14  | Typed variables + run-time prompts   | Compounding    | Both     | M      | variables system exists                  |
| 15  | AI assist (explain → fix → generate) | Scaffolding    | Beginner | L      | schema/profile grounding exists          |

**Suggested sequencing:** ship rows 1–3 immediately (one small release, pure polish, instantly felt). Rows 4–6 next — they close the zero-loss hole and the lakehouse cost story. Rows 7–12 form the "serious tool" release for experts. Rows 13–15 are the differentiation bets; start 15 only once history + catalog search exist, because grounded context is what makes the AI feature good.
