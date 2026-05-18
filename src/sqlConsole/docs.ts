import { ConnType } from '../interfaces';

export interface ISqlDoc {
  /** One-line description. */
  summary: string;
  /** Optional usage signature, e.g. `DATE_TRUNC(field, source)`. */
  signature?: string;
  /** Multi-line example, rendered inside a <pre> block. */
  example?: string;
}

// Items live in three buckets:
//   - GENERIC    — basic SQL keywords (SELECT, JOIN, etc.) shown everywhere.
//   - PER_DIALECT — engine-specific functions/keywords keyed by ConnType.
// Names are stored upper-cased; the lookup function uppercases the label
// before searching, so the source data stays compact.

const GENERIC: Record<string, ISqlDoc> = {
  SELECT: {
    summary: 'Retrieve rows from one or more tables.',
    signature: 'SELECT [DISTINCT] cols FROM table [WHERE ...]',
    example: 'SELECT id, name\nFROM users\nWHERE active = TRUE;'
  },
  INSERT: {
    summary: 'Insert one or more rows into a table.',
    signature: 'INSERT INTO table (cols) VALUES (...)',
    example: "INSERT INTO users (name, email)\nVALUES ('Ada', 'ada@x.io');"
  },
  UPDATE: {
    summary: 'Modify existing rows that match a condition.',
    signature: 'UPDATE table SET col = expr [WHERE ...]',
    example: 'UPDATE users\nSET active = FALSE\nWHERE last_seen < NOW() - INTERVAL \'30 day\';'
  },
  DELETE: {
    summary: 'Remove rows matching a condition. Without WHERE, removes ALL rows.',
    signature: 'DELETE FROM table [WHERE ...]',
    example: 'DELETE FROM sessions\nWHERE expires_at < NOW();'
  },
  WITH: {
    summary: 'Define a Common Table Expression (CTE) — a named subquery.',
    signature: 'WITH cte_name AS (subquery) SELECT ...',
    example:
      'WITH recent AS (\n  SELECT * FROM orders WHERE created_at > NOW() - INTERVAL \'7 day\'\n)\nSELECT customer_id, COUNT(*) FROM recent GROUP BY customer_id;'
  },
  JOIN: {
    summary: 'Combine rows from two tables based on a related column.',
    signature: 'a JOIN b ON a.x = b.y',
    example: 'SELECT u.name, o.total\nFROM users u\nJOIN orders o ON o.user_id = u.id;'
  },
  'LEFT JOIN': {
    summary: 'Return all rows from the left table, with matches from the right (NULL when no match).',
    example: 'SELECT u.name, o.id\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id;'
  },
  GROUP: {
    summary: 'GROUP BY collapses rows that share values into a single output row per group.',
    signature: 'SELECT col, AGG(...) FROM t GROUP BY col',
    example: 'SELECT country, COUNT(*) FROM users GROUP BY country;'
  },
  HAVING: {
    summary: 'Filter groups produced by GROUP BY (post-aggregation, unlike WHERE).',
    example:
      'SELECT country, COUNT(*) AS n\nFROM users\nGROUP BY country\nHAVING COUNT(*) > 100;'
  },
  ORDER: {
    summary: 'Sort rows by one or more columns. Direction: ASC (default) or DESC.',
    signature: 'ORDER BY col [ASC|DESC]'
  },
  LIMIT: {
    summary: 'Cap the number of rows returned. Common after ORDER BY.',
    example: 'SELECT * FROM events ORDER BY ts DESC LIMIT 10;'
  },
  CASE: {
    summary: 'Conditional expression — returns the first matching THEN clause.',
    example:
      "CASE WHEN score >= 90 THEN 'A'\n     WHEN score >= 80 THEN 'B'\n     ELSE 'C'\nEND"
  },
  COALESCE: {
    summary: 'Return the first non-NULL argument.',
    signature: 'COALESCE(expr1, expr2, ...)',
    example: "SELECT COALESCE(nickname, name, 'anonymous') FROM users;"
  },
  COUNT: {
    summary: 'Count rows. COUNT(*) counts all; COUNT(col) skips NULLs; COUNT(DISTINCT col) counts unique.',
    example: 'SELECT COUNT(*), COUNT(DISTINCT user_id) FROM events;'
  },
  SUM: { summary: 'Aggregate sum of numeric values. NULLs are skipped.' },
  AVG: { summary: 'Average of numeric values. NULLs are skipped.' },
  MIN: { summary: 'Minimum non-NULL value.' },
  MAX: { summary: 'Maximum non-NULL value.' },
  CAST: {
    summary: 'Convert a value to a target type.',
    signature: 'CAST(expr AS type)',
    example: "SELECT CAST('42' AS INTEGER), CAST(now() AS DATE);"
  },
  DISTINCT: { summary: 'Eliminate duplicate rows from the result.' },
  UNION: {
    summary: 'Combine two result sets, removing duplicates. UNION ALL keeps duplicates (faster).',
    example: 'SELECT id FROM a\nUNION ALL\nSELECT id FROM b;'
  }
};

const PG_DOCS: Record<string, ISqlDoc> = {
  DATE_TRUNC: {
    summary: 'Truncate a timestamp to the given unit (day, hour, month, …).',
    signature: "DATE_TRUNC(unit, timestamp)",
    example: "SELECT DATE_TRUNC('day', NOW());"
  },
  GENERATE_SERIES: {
    summary: 'Generate a series of values (e.g. for date ranges).',
    signature: 'GENERATE_SERIES(start, stop, step)',
    example:
      "SELECT generate_series('2024-01-01'::date, '2024-12-31'::date, '1 day');"
  },
  ARRAY_AGG: {
    summary: 'Aggregate values into an array.',
    example: 'SELECT user_id, ARRAY_AGG(tag) FROM tags GROUP BY user_id;'
  },
  JSONB_BUILD_OBJECT: {
    summary: 'Build a JSONB object from alternating key/value pairs.',
    example: "SELECT JSONB_BUILD_OBJECT('id', id, 'name', name) FROM users;"
  },
  STRING_AGG: {
    summary: 'Concatenate values into a string with a separator.',
    signature: 'STRING_AGG(expr, sep [ORDER BY ...])',
    example: "SELECT STRING_AGG(name, ', ' ORDER BY name) FROM users;"
  },
  NOW: { summary: 'Current transaction-start timestamp (with time zone).' },
  RETURNING: {
    summary: 'Postgres-only: return columns from the row that was INSERT/UPDATE/DELETE-d.',
    example: "INSERT INTO users(name) VALUES ('Ada') RETURNING id;"
  }
};

const MYSQL_DOCS: Record<string, ISqlDoc> = {
  GROUP_CONCAT: {
    summary: 'Concatenate group values into a single string.',
    signature: 'GROUP_CONCAT([DISTINCT] expr [ORDER BY ...] [SEPARATOR ","])',
    example:
      "SELECT user_id, GROUP_CONCAT(tag SEPARATOR ',') FROM tags GROUP BY user_id;"
  },
  IFNULL: {
    summary: 'Return the second argument if the first is NULL.',
    example: "SELECT IFNULL(nickname, 'anon') FROM users;"
  },
  DATE_FORMAT: {
    summary: 'Format a date/timestamp with a format string (MySQL specifiers).',
    example: "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s');"
  },
  STR_TO_DATE: {
    summary: 'Parse a string into a date using MySQL format specifiers.',
    example: "SELECT STR_TO_DATE('2024-03-12', '%Y-%m-%d');"
  },
  ON_DUPLICATE_KEY_UPDATE: {
    summary: 'Upsert-style: UPDATE the matched row if INSERT hits a unique-key conflict.',
    example:
      'INSERT INTO counters(k, n) VALUES (?, 1)\nON DUPLICATE KEY UPDATE n = n + 1;'
  }
};

const TRINO_DOCS: Record<string, ISqlDoc> = {
  // ── Casting & conditionals ───────────────────────────────────────────
  TRY_CAST: {
    summary: 'CAST that returns NULL on failure instead of raising.',
    signature: 'TRY_CAST(expr AS type)',
    example: "SELECT TRY_CAST(value AS INTEGER) FROM raw;"
  },
  TRY: {
    summary: 'Wrap an expression so divide-by-zero / overflow returns NULL.',
    signature: 'TRY(expression)',
    example: 'SELECT TRY(numerator / denominator) FROM ratios;'
  },
  TYPEOF: {
    summary: 'Return the SQL type name of an expression (for debugging).',
    example: "SELECT TYPEOF(CAST(1 AS BIGINT));   -- 'bigint'"
  },
  IF: {
    summary: 'IF(cond, then [, else]) — ternary. Standard CASE also works.',
    signature: 'IF(condition, true_value [, false_value])',
    example: "SELECT IF(score >= 80, 'pass', 'fail') FROM grades;"
  },
  GREATEST: {
    summary: 'Largest of the given values (NULLs ignored unless all are NULL).',
    example: 'SELECT GREATEST(a, b, c) FROM t;'
  },
  LEAST: { summary: 'Smallest of the given values (NULLs ignored unless all are NULL).' },

  // ── Date & time ──────────────────────────────────────────────────────
  DATE_TRUNC: {
    summary: 'Truncate timestamp to unit (second, minute, hour, day, week, month, quarter, year).',
    signature: 'DATE_TRUNC(unit, x)',
    example: "SELECT DATE_TRUNC('day', NOW());"
  },
  DATE_ADD: {
    summary: 'Add an interval unit to a date/timestamp.',
    signature: 'DATE_ADD(unit, value, timestamp)',
    example: "SELECT DATE_ADD('day', 7, CURRENT_DATE);"
  },
  DATE_DIFF: {
    summary: 'Difference between two timestamps in the given unit.',
    signature: 'DATE_DIFF(unit, t1, t2)',
    example: "SELECT DATE_DIFF('day', start_ts, end_ts) FROM jobs;"
  },
  DATE_FORMAT: {
    summary: 'Format a timestamp using MySQL-style specifiers (%Y, %m, %d, %H, %i, %s).',
    example: "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s');"
  },
  DATE_PARSE: {
    summary: 'Parse a string into a timestamp using MySQL-style specifiers.',
    example: "SELECT DATE_PARSE('2024-03-12 14:30', '%Y-%m-%d %H:%i');"
  },
  FROM_UNIXTIME: {
    summary: 'Convert a UNIX epoch (seconds) into a timestamp.',
    example: 'SELECT FROM_UNIXTIME(1700000000);'
  },
  TO_UNIXTIME: {
    summary: 'Convert a timestamp to UNIX epoch (seconds, may be fractional).',
    example: 'SELECT TO_UNIXTIME(NOW());'
  },
  TO_ISO8601: {
    summary: 'Render a timestamp/date as an ISO 8601 string.',
    example: "SELECT TO_ISO8601(NOW());   -- '2026-05-18T10:30:00.000Z'"
  },
  AT_TIMEZONE: {
    summary: '`AT TIME ZONE` — convert a timestamp into another zone.',
    example: "SELECT timestamp '2024-01-01 00:00:00 UTC' AT TIME ZONE 'America/New_York';"
  },
  LAST_DAY_OF_MONTH: {
    summary: 'Last calendar day of the month containing the given date.',
    example: 'SELECT LAST_DAY_OF_MONTH(DATE \'2024-02-15\');   -- 2024-02-29'
  },

  // ── Aggregates ───────────────────────────────────────────────────────
  APPROX_DISTINCT: {
    summary: 'HyperLogLog-based approximate count distinct. Much cheaper than COUNT(DISTINCT).',
    signature: 'APPROX_DISTINCT(x [, max_std_err])',
    example: 'SELECT APPROX_DISTINCT(user_id) FROM events;'
  },
  APPROX_PERCENTILE: {
    summary: 'Approximate percentile via t-digest.',
    signature: 'APPROX_PERCENTILE(x, percentage)',
    example: 'SELECT APPROX_PERCENTILE(latency_ms, 0.95) FROM requests;'
  },
  ARBITRARY: {
    summary: 'Return an arbitrary non-NULL value from the group (faster than MIN/MAX when you just need any).',
    example: 'SELECT user_id, ARBITRARY(name) FROM users_seen GROUP BY user_id;'
  },
  ARRAY_AGG: {
    summary: 'Aggregate values into an array.',
    example: 'SELECT k, ARRAY_AGG(v ORDER BY ts) FROM kv GROUP BY k;'
  },
  MAP_AGG: {
    summary: 'Aggregate key/value pairs into a single map.',
    signature: 'MAP_AGG(key, value)',
    example: 'SELECT user_id, MAP_AGG(metric, value) FROM stats GROUP BY user_id;'
  },
  MULTIMAP_AGG: {
    summary: 'Like MAP_AGG but the values for a key are collected into an array.',
    example: 'SELECT MULTIMAP_AGG(tag, score) FROM hits;'
  },
  HISTOGRAM: {
    summary: 'Aggregate values into a map<value, count>.',
    example: 'SELECT HISTOGRAM(status_code) FROM requests;'
  },
  MAX_BY: {
    summary: 'Return the value of `x` at the row where `y` is the maximum.',
    signature: 'MAX_BY(x, y [, n])',
    example: 'SELECT MAX_BY(name, score) FROM players;   -- highest scorer\'s name'
  },
  MIN_BY: { summary: 'Return `x` at the row where `y` is the minimum.', signature: 'MIN_BY(x, y [, n])' },
  COUNT_IF: {
    summary: 'COUNT rows where the boolean expression is TRUE.',
    example: "SELECT COUNT_IF(status = 'error') FROM logs;"
  },
  BOOL_AND: { summary: 'Logical AND across a group (TRUE only if all rows are TRUE).' },
  BOOL_OR: { summary: 'Logical OR across a group (TRUE if any row is TRUE).' },
  EVERY: { summary: 'Synonym for BOOL_AND.' },
  GEOMETRIC_MEAN: { summary: 'Geometric mean of non-negative values in the group.' },

  // ── Arrays ───────────────────────────────────────────────────────────
  UNNEST: {
    summary: 'Expand an array (or map) into rows. Use with CROSS JOIN.',
    example:
      'SELECT u.id, t\nFROM users u\nCROSS JOIN UNNEST(u.tags) AS x(t);'
  },
  CARDINALITY: {
    summary: 'Number of elements in an array or map (use this instead of LENGTH for those types).',
    example: 'SELECT CARDINALITY(tags) FROM users;'
  },
  ELEMENT_AT: {
    summary: 'Get the element at the given index (1-based) for arrays, or by key for maps. Returns NULL if missing.',
    example: 'SELECT ELEMENT_AT(tags, 1), ELEMENT_AT(props, \'color\') FROM items;'
  },
  CONTAINS: {
    summary: 'TRUE if the array contains the value.',
    example: "SELECT CONTAINS(tags, 'priority') FROM tickets;"
  },
  ARRAY_DISTINCT: { summary: 'Remove duplicate elements from an array.' },
  ARRAY_INTERSECT: {
    summary: 'Elements present in both arrays.',
    example: 'SELECT ARRAY_INTERSECT(ARRAY[1,2,3], ARRAY[2,3,4]);   -- [2,3]'
  },
  ARRAY_UNION: { summary: 'Elements present in either array, deduplicated.' },
  ARRAY_JOIN: {
    summary: 'Concatenate array elements into a string using a separator.',
    signature: 'ARRAY_JOIN(array, separator [, null_replacement])',
    example: "SELECT ARRAY_JOIN(tags, ', ') FROM users;"
  },
  ARRAY_MAX: { summary: 'Largest non-NULL element of the array.' },
  ARRAY_MIN: { summary: 'Smallest non-NULL element of the array.' },
  ARRAY_POSITION: {
    summary: '1-based index of the first matching element, or 0 if not found.',
    example: 'SELECT ARRAY_POSITION(ARRAY[\'a\',\'b\',\'c\'], \'b\');   -- 2'
  },
  ARRAY_SORT: {
    summary: 'Sort array elements ascending. Pass a comparator lambda for custom order.',
    example: 'SELECT ARRAY_SORT(ARRAY[3,1,2]);   -- [1,2,3]'
  },
  ARRAY_REMOVE: { summary: 'Remove all occurrences of a value from the array.' },
  FILTER: {
    summary: 'Filter an array with a lambda predicate.',
    signature: 'FILTER(array, x -> predicate)',
    example: 'SELECT FILTER(scores, x -> x >= 80) FROM students;'
  },
  TRANSFORM: {
    summary: 'Map each array element through a lambda.',
    signature: 'TRANSFORM(array, x -> expr)',
    example: 'SELECT TRANSFORM(prices, x -> x * 1.1) FROM products;'
  },
  REDUCE: {
    summary: 'Fold an array down to a single value via init + combine + finish.',
    signature: 'REDUCE(array, init, (s, x) -> next_s, s -> final)',
    example: 'SELECT REDUCE(ARRAY[1,2,3], 0, (s,x) -> s+x, s -> s);   -- 6'
  },
  FLATTEN: {
    summary: 'Flatten an array of arrays into a single array.',
    example: 'SELECT FLATTEN(ARRAY[ARRAY[1,2], ARRAY[3,4]]);   -- [1,2,3,4]'
  },
  SEQUENCE: {
    summary: 'Generate a sequence of values: numbers, dates, or timestamps.',
    signature: 'SEQUENCE(start, stop [, step])',
    example: "SELECT SEQUENCE(DATE '2024-01-01', DATE '2024-01-31', INTERVAL '1' DAY);"
  },
  SLICE: {
    summary: 'Sub-array from index `start` (1-based), `length` elements.',
    example: 'SELECT SLICE(ARRAY[1,2,3,4,5], 2, 3);   -- [2,3,4]'
  },
  ZIP: {
    summary: 'Combine multiple arrays element-wise into rows of structs.',
    example: 'SELECT ZIP(ARRAY[1,2,3], ARRAY[\'a\',\'b\',\'c\']);'
  },
  ZIP_WITH: {
    summary: 'ZIP two arrays then map each pair through a lambda.',
    example: 'SELECT ZIP_WITH(prices, qty, (p, q) -> p * q) FROM line_items;'
  },

  // ── Maps ─────────────────────────────────────────────────────────────
  MAP: {
    summary: 'Construct a map from two arrays (keys + values), or as map_from_entries.',
    example: 'SELECT MAP(ARRAY[\'a\',\'b\'], ARRAY[1,2]);'
  },
  MAP_KEYS: { summary: 'Return an array of the map\'s keys.' },
  MAP_VALUES: { summary: 'Return an array of the map\'s values.' },
  MAP_CONCAT: { summary: 'Merge multiple maps. Right-most wins on duplicate keys.' },
  MAP_FILTER: {
    summary: 'Filter map entries by a (k, v) -> bool lambda.',
    example: 'SELECT MAP_FILTER(props, (k, v) -> v IS NOT NULL) FROM rows;'
  },
  MAP_ZIP_WITH: {
    summary: 'Merge two maps; for shared keys, combine values via lambda.',
    example: 'SELECT MAP_ZIP_WITH(a, b, (k, va, vb) -> coalesce(va,0) + coalesce(vb,0));'
  },

  // ── Strings ──────────────────────────────────────────────────────────
  REGEXP_LIKE: {
    summary: 'TRUE if the string matches the Java regex.',
    example: "SELECT REGEXP_LIKE(email, '^[^@]+@example\\\\.com$');"
  },
  REGEXP_EXTRACT: {
    summary: 'Return the first regex match (or NULL).',
    signature: 'REGEXP_EXTRACT(string, pattern [, group])',
    example: "SELECT REGEXP_EXTRACT('order #1234', '#(\\\\d+)', 1);   -- '1234'"
  },
  REGEXP_EXTRACT_ALL: {
    summary: 'Return all regex matches as an array.',
    example: "SELECT REGEXP_EXTRACT_ALL('a1 b2 c3', '\\\\d');   -- ['1','2','3']"
  },
  REGEXP_REPLACE: {
    summary: 'Replace regex matches with a literal or back-reference template.',
    example: "SELECT REGEXP_REPLACE(s, '\\\\s+', ' ');"
  },
  REGEXP_SPLIT: {
    summary: 'Split a string by a regex into an array.',
    example: "SELECT REGEXP_SPLIT('a, b,  c', ',\\\\s*');"
  },
  SPLIT: {
    summary: 'Split a string by a literal delimiter into an array.',
    example: "SELECT SPLIT('a,b,c', ',');"
  },
  SPLIT_PART: {
    summary: 'Return the Nth (1-based) part of a split string.',
    example: "SELECT SPLIT_PART(path, '/', 1);"
  },
  STRPOS: {
    summary: '1-based position of the first occurrence of a substring (0 if not found).',
    example: "SELECT STRPOS('hello world', 'world');   -- 7"
  },
  CONCAT: { summary: 'Concatenate strings or arrays.' },
  POSITION: { summary: 'SQL-standard alternative to STRPOS: POSITION(needle IN haystack).' },
  LISTAGG: {
    summary: 'String aggregation with separator and overflow handling.',
    signature: 'LISTAGG(expr, sep [ON OVERFLOW TRUNCATE]) WITHIN GROUP (ORDER BY ...)',
    example: "SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name) FROM users;"
  },

  // ── JSON ─────────────────────────────────────────────────────────────
  JSON_PARSE: {
    summary: 'Parse a JSON string into a JSON value.',
    example: "SELECT JSON_PARSE('{\"a\":1}');"
  },
  JSON_FORMAT: {
    summary: 'Serialize a JSON value back to a string.',
    example: "SELECT JSON_FORMAT(JSON '{\"a\":1}');"
  },
  JSON_EXTRACT: {
    summary: 'Extract a sub-JSON value with a JSONPath ($-rooted) expression.',
    example: "SELECT JSON_EXTRACT(payload, '$.user.id') FROM events;"
  },
  JSON_EXTRACT_SCALAR: {
    summary: 'Like JSON_EXTRACT but always returns VARCHAR (not JSON). Best for atom-typed leaves.',
    example: "SELECT JSON_EXTRACT_SCALAR(payload, '$.user.id') FROM events;"
  },
  JSON_ARRAY_CONTAINS: {
    summary: 'TRUE if the JSON array contains the value.',
    example: "SELECT JSON_ARRAY_CONTAINS(tags_json, 'priority');"
  },
  JSON_SIZE: {
    summary: 'Size of the JSON array/object at the JSONPath location.',
    example: "SELECT JSON_SIZE(payload, '$.items');"
  },

  // ── Window functions ─────────────────────────────────────────────────
  LAG: {
    summary: 'Value from a previous row in the partition (default 1 row back).',
    signature: 'LAG(expr [, offset [, default]]) OVER (PARTITION BY ... ORDER BY ...)',
    example: 'SELECT ts, value, LAG(value) OVER (PARTITION BY user_id ORDER BY ts) AS prev FROM events;'
  },
  LEAD: { summary: 'Value from a following row in the partition (mirror of LAG).' },
  ROW_NUMBER: {
    summary: 'Sequential 1-based row number within a window partition.',
    example: 'SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts DESC) AS rn FROM events;'
  },
  RANK: { summary: 'Rank within a window — ties get the same rank, leaving gaps.' },
  DENSE_RANK: { summary: 'Like RANK but ties share a rank and the next rank is +1 (no gaps).' },
  NTILE: { summary: 'Bucket rows of the partition into N equally-sized groups.' },
  FIRST_VALUE: { summary: 'First value in the window frame.' },
  LAST_VALUE: { summary: 'Last value in the window frame (mind the default frame!).' },
  NTH_VALUE: { summary: 'The Nth value (1-based) in the window frame.' },
  CUME_DIST: { summary: 'Cumulative distribution: fraction of rows ≤ current row in the window.' },
  PERCENT_RANK: { summary: '(rank - 1) / (partition_rows - 1). Useful for percentile bands.' },

  // ── Statements & misc ────────────────────────────────────────────────
  WITH: {
    summary: 'Trino supports recursive CTEs via WITH RECURSIVE.',
    example:
      'WITH RECURSIVE t(n) AS (\n  VALUES (1)\n  UNION ALL\n  SELECT n + 1 FROM t WHERE n < 10\n)\nSELECT * FROM t;'
  },
  VALUES: {
    summary: 'Inline literal table — useful for ad-hoc data or for joining against a fixed set.',
    example: "SELECT * FROM (VALUES (1, 'a'), (2, 'b')) AS t(id, label);"
  },
  GROUPING: {
    summary: 'Returns 1 if the grouping set didn\'t group by the listed column (use in ROLLUP/CUBE output).',
    example: 'SELECT GROUPING(country), COUNT(*) FROM users GROUP BY ROLLUP(country);'
  },
  ROLLUP: {
    summary: 'Multiple grouping sets including subtotals across a hierarchy.',
    example: 'SELECT country, city, COUNT(*) FROM users GROUP BY ROLLUP(country, city);'
  },
  CUBE: {
    summary: 'All possible grouping combinations of the given columns.',
    example: 'SELECT a, b, COUNT(*) FROM t GROUP BY CUBE(a, b);'
  },
  TABLESAMPLE: {
    summary: 'Read a random sample of the table. Two methods: BERNOULLI (row-level) and SYSTEM (block-level).',
    example: 'SELECT * FROM events TABLESAMPLE BERNOULLI (1);   -- 1% sample'
  },
  EXPLAIN: {
    summary: 'Show the query plan. EXPLAIN ANALYZE actually runs the query and reports timings.',
    example: 'EXPLAIN ANALYZE SELECT COUNT(*) FROM events WHERE day = current_date;'
  },
  SHOW: {
    summary: 'Metadata queries: SHOW CATALOGS / SCHEMAS / TABLES / COLUMNS / FUNCTIONS / SESSION.',
    example: 'SHOW TABLES FROM hive.default;'
  },
  USE: {
    summary: 'Switch the session\'s default catalog and/or schema.',
    example: 'USE hive.default;'
  },
  UUID: { summary: 'Return a random RFC 4122 v4 UUID.', example: 'SELECT UUID();' },
  RAND: { summary: 'Random double in [0, 1).' },
  RANDOM: { summary: 'Synonym for RAND. RANDOM(n) returns a random int in [0, n).' }
};

const HIVE_DOCS: Record<string, ISqlDoc> = {
  EXPLODE: {
    summary: 'Hive UDTF: expand an array column into one row per element. Use with LATERAL VIEW.',
    example:
      'SELECT u.id, tag\nFROM users u\nLATERAL VIEW EXPLODE(u.tags) t AS tag;'
  },
  POSEXPLODE: {
    summary: 'Like EXPLODE but also returns a position column.',
    example:
      'LATERAL VIEW POSEXPLODE(arr) t AS pos, val'
  },
  COLLECT_SET: {
    summary: 'Aggregate distinct values into an array.',
    example: 'SELECT user_id, COLLECT_SET(tag) FROM tags GROUP BY user_id;'
  },
  COLLECT_LIST: {
    summary: 'Aggregate values into an array, preserving duplicates and order.'
  },
  GET_JSON_OBJECT: {
    summary: 'Extract a field from a JSON string using a JSONPath-like expression.',
    example: "SELECT GET_JSON_OBJECT(json_col, '$.user.id') FROM events;"
  },
  STR_TO_MAP: {
    summary: 'Split a string into a map<string,string>.',
    example: "SELECT STR_TO_MAP('a:1,b:2', ',', ':');"
  },
  'LATERAL VIEW': {
    summary: 'Apply a UDTF (EXPLODE, POSEXPLODE, ...) and join its rows to the outer row.',
    example: 'FROM t LATERAL VIEW EXPLODE(t.arr) v AS item'
  }
};

const STARROCKS_DOCS: Record<string, ISqlDoc> = {
  // ── Bitmap (StarRocks' superpower for fast COUNT DISTINCT) ───────────
  TO_BITMAP: {
    summary: 'Convert an unsigned 64-bit integer column into a bitmap value. The base building block for COUNT DISTINCT acceleration.',
    signature: 'TO_BITMAP(int_value)',
    example: 'SELECT BITMAP_UNION(TO_BITMAP(user_id))\nFROM events\nGROUP BY day;'
  },
  BITMAP_UNION: {
    summary: 'Aggregate function: merge BITMAP values into a single bitmap (set-union).',
    example: 'SELECT day, BITMAP_UNION(user_bitmap) FROM daily_active GROUP BY day;'
  },
  BITMAP_UNION_COUNT: {
    summary: 'Aggregate distinct count via bitmap union. Equivalent to BITMAP_COUNT(BITMAP_UNION(x)) but faster in one shot.',
    example: 'SELECT day, BITMAP_UNION_COUNT(user_bitmap) AS dau FROM daily_active GROUP BY day;'
  },
  BITMAP_INTERSECT: {
    summary: 'Aggregate function: bitmap intersection — IDs present in ALL groups. Useful for retention/cohort analysis.',
    example: 'SELECT BITMAP_INTERSECT(user_bitmap) FROM daily_active WHERE day IN (\'2024-01-01\', \'2024-01-02\');'
  },
  BITMAP_AND: {
    summary: 'Scalar: AND two bitmaps (set intersection).',
    example: 'SELECT BITMAP_TO_STRING(BITMAP_AND(a, b)) FROM t;'
  },
  BITMAP_AND_COUNT: {
    summary: 'Count of set bits in BITMAP_AND(a, b). Cheaper than building the result.'
  },
  BITMAP_OR: { summary: 'Scalar: OR two bitmaps (set union).' },
  BITMAP_OR_COUNT: { summary: 'Count of set bits in BITMAP_OR(a, b).' },
  BITMAP_XOR: { summary: 'Scalar: XOR two bitmaps (symmetric difference).' },
  BITMAP_CONTAINS: {
    summary: 'TRUE if the bitmap contains the given integer.',
    example: 'SELECT BITMAP_CONTAINS(user_bitmap, 1001) FROM daily_active;'
  },
  BITMAP_COUNT: { summary: 'Number of set bits (= distinct integers) in the bitmap.' },
  BITMAP_EMPTY: { summary: 'Construct an empty bitmap literal — useful for default values.' },
  BITMAP_FROM_STRING: {
    summary: 'Parse a comma-separated integer string into a bitmap.',
    example: "SELECT BITMAP_FROM_STRING('1,2,3,4');"
  },
  BITMAP_TO_STRING: {
    summary: 'Render a bitmap as a comma-separated integer string (debugging / export).',
    example: 'SELECT BITMAP_TO_STRING(user_bitmap) FROM daily_active LIMIT 1;'
  },
  BITMAP_HASH: {
    summary: 'Hash an arbitrary string column into a 64-bit int suitable for TO_BITMAP. Use when your unique IDs are strings.',
    example: 'SELECT BITMAP_UNION(TO_BITMAP(BITMAP_HASH(email))) FROM users GROUP BY country;'
  },

  // ── HLL (HyperLogLog) — alternative for approximate distinct ────────
  HLL_UNION: {
    summary: 'Aggregate function: union HLL values into one. Pair with HLL_HASH / HLL_CARDINALITY.',
    example: 'SELECT HLL_UNION(hll_col) FROM daily_users GROUP BY week;'
  },
  HLL_UNION_AGG: {
    summary: 'Approximate distinct count via HLL — like APPROX_COUNT_DISTINCT but on the HLL type.',
    example: 'SELECT HLL_UNION_AGG(hll_col) FROM daily_users;'
  },
  HLL_HASH: {
    summary: 'Hash a value into an HLL register. Use when you didn\'t ingest an HLL column directly.',
    example: 'SELECT HLL_UNION_AGG(HLL_HASH(session_id)) FROM events;'
  },
  HLL_CARDINALITY: { summary: 'Approximate distinct count of a single HLL value.' },
  HLL_EMPTY: { summary: 'Construct an empty HLL literal.' },

  // ── Percentile & advanced aggregates ────────────────────────────────
  PERCENTILE_APPROX: {
    summary: 'Approximate percentile (t-digest based). Cheap, scalable.',
    signature: 'PERCENTILE_APPROX(col, p [, B])',
    example: 'SELECT PERCENTILE_APPROX(latency_ms, 0.95) FROM requests;'
  },
  PERCENTILE_UNION: {
    summary: 'Merge pre-aggregated PERCENTILE values (used with materialized-view rollups).',
    example: 'SELECT PERCENTILE_UNION(p_state) FROM rollup_p95;'
  },
  PERCENTILE_CONT: {
    summary: 'Continuous (interpolated) percentile — exact, but slower than PERCENTILE_APPROX.',
    example: 'SELECT PERCENTILE_CONT(price, 0.5) FROM listings;   -- median'
  },
  PERCENTILE_DISC: {
    summary: 'Discrete percentile — picks an actual value in the column (no interpolation).'
  },
  NDV: {
    summary: 'Approximate distinct count (NDV = Number of Distinct Values). Backed by HLL — same engine as HLL_UNION_AGG.',
    example: 'SELECT NDV(user_id) FROM events;'
  },
  MULTI_DISTINCT_COUNT: {
    summary: 'Faster COUNT(DISTINCT col) when you actually need exact results — uses a multi-pass plan StarRocks optimizes.',
    example: 'SELECT MULTI_DISTINCT_COUNT(user_id) FROM events;'
  },
  MULTI_DISTINCT_SUM: { summary: 'Sum-of-distinct, same fast-path treatment as MULTI_DISTINCT_COUNT.' },
  MAX_BY: { summary: 'Return `x` at the row where `y` is the maximum.', signature: 'MAX_BY(x, y)' },
  MIN_BY: { summary: 'Return `x` at the row where `y` is the minimum.', signature: 'MIN_BY(x, y)' },

  // ── Funnel / retention (analytics specialties) ───────────────────────
  WINDOW_FUNNEL: {
    summary: 'Funnel analysis: per partition, returns the deepest ordered step matched within a time window.',
    signature: 'WINDOW_FUNNEL(window_sec, mode, ts, cond1, cond2, …)',
    example:
      "SELECT user_id,\n  WINDOW_FUNNEL(3600, 'default', ts,\n    event = 'view',\n    event = 'add_to_cart',\n    event = 'checkout') AS step\nFROM events GROUP BY user_id;"
  },
  RETENTION: {
    summary: 'Cohort retention: returns an array of 0/1 flags — first element marks the cohort event, the rest mark return events.',
    example: "SELECT RETENTION(event = 'signup', event = 'login') FROM events GROUP BY user_id;"
  },

  // ── Arrays ───────────────────────────────────────────────────────────
  ARRAY_AGG: { summary: 'Aggregate values into an array.', example: 'SELECT category, ARRAY_AGG(name) FROM products GROUP BY category;' },
  ARRAY_AVG: { summary: 'Mean of numeric elements in the array.' },
  ARRAY_SUM: { summary: 'Sum of numeric elements in the array.' },
  ARRAY_LENGTH: { summary: 'Number of elements in the array (use this, not LENGTH).' },
  ARRAY_CONTAINS: {
    summary: 'TRUE if the array contains the given value.',
    example: "SELECT * FROM tickets WHERE ARRAY_CONTAINS(tags, 'urgent');"
  },
  ARRAY_DISTINCT: { summary: 'Drop duplicates from an array.' },
  ARRAY_INTERSECT: { summary: 'Elements present in both arrays.' },
  ARRAY_CONCAT: {
    summary: 'Concatenate multiple arrays.',
    example: 'SELECT ARRAY_CONCAT(tags_a, tags_b) FROM merged;'
  },
  ARRAY_DIFFERENCE: {
    summary: 'Adjacent differences: [a[1]-a[0], a[2]-a[1], …].',
    example: 'SELECT ARRAY_DIFFERENCE([1, 3, 6, 10]);   -- [null, 2, 3, 4]'
  },
  ARRAY_FILTER: {
    summary: 'Keep only array elements matching the lambda predicate.',
    example: 'SELECT ARRAY_FILTER(scores, x -> x >= 80) FROM students;'
  },
  ARRAY_JOIN: {
    summary: 'Join array elements into a string.',
    example: "SELECT ARRAY_JOIN(tags, ', ') FROM users;"
  },
  ARRAY_MAX: { summary: 'Largest non-NULL element.' },
  ARRAY_MIN: { summary: 'Smallest non-NULL element.' },
  ARRAY_POSITION: { summary: '1-based position of the value in the array, or 0 if absent.' },
  ARRAY_REMOVE: { summary: 'Remove all occurrences of a value from the array.' },
  ARRAY_SLICE: { summary: 'Sub-array: ARRAY_SLICE(array, offset, length). 1-based.' },
  ARRAY_SORT: { summary: 'Sort the array ascending.' },
  ARRAYS_OVERLAP: { summary: 'TRUE if two arrays share at least one common element.' },

  // ── JSON ─────────────────────────────────────────────────────────────
  GET_JSON_STRING: {
    summary: 'Extract a string field from a JSON column via $.path.',
    example: "SELECT GET_JSON_STRING(payload, '$.user.name') FROM events;"
  },
  GET_JSON_INT: { summary: 'Extract an integer field from a JSON column.' },
  GET_JSON_DOUBLE: { summary: 'Extract a double field from a JSON column.' },
  JSON_QUERY: {
    summary: 'Extract a sub-JSON value as JSON (preserves type).',
    example: "SELECT JSON_QUERY(payload, '$.items') FROM events;"
  },
  JSON_EXISTS: { summary: 'TRUE if the JSON path matches anything.' },
  JSON_LENGTH: { summary: 'Length of the JSON array/object at the given path.' },
  JSON_OBJECT: {
    summary: 'Construct a JSON object from key/value pairs.',
    example: "SELECT JSON_OBJECT('id', id, 'name', name) FROM users;"
  },
  JSON_ARRAY: { summary: 'Construct a JSON array from a list of values.' },
  JSON_TYPE: {
    summary: 'Return the JSON type at the given path: object, array, string, number, bool, null.',
    example: "SELECT JSON_TYPE(payload, '$.items');"
  },

  // ── Date & time ──────────────────────────────────────────────────────
  DATE_TRUNC: {
    summary: 'Truncate a datetime to the given unit. StarRocks unit names follow MySQL (day, week, month, …).',
    signature: 'DATE_TRUNC(unit, datetime)',
    example: "SELECT DATE_TRUNC('day', created_at) AS d, COUNT(*) FROM events GROUP BY d;"
  },
  DATE_FORMAT: {
    summary: 'Format a datetime using MySQL-style specifiers.',
    example: "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s');"
  },
  STR_TO_DATE: {
    summary: 'Parse a string into a datetime using MySQL specifiers.',
    example: "SELECT STR_TO_DATE('2024-03-12', '%Y-%m-%d');"
  },
  DATE_DIFF: {
    summary: 'Days between two dates (MySQL semantics: a − b, can be negative).',
    example: "SELECT DATE_DIFF(NOW(), DATE '2024-01-01');"
  },
  DAYS_DIFF: { summary: 'Synonym/explicit-unit form of DATE_DIFF in days.' },
  YEARS_DIFF: { summary: 'Whole years between two datetimes.' },
  DATE_SUB: {
    summary: 'Subtract an interval from a datetime.',
    example: "SELECT DATE_SUB(NOW(), INTERVAL 7 DAY);"
  },
  DATE_SLICE: {
    summary: 'Bucket a datetime to a fixed-size window. Useful for time-bucketed grouping.',
    signature: 'DATE_SLICE(datetime, interval, unit [, boundary])',
    example: "SELECT DATE_SLICE(ts, 5, 'minute') AS bucket, COUNT(*) FROM events GROUP BY bucket;"
  },
  TIME_SLICE: { summary: 'Like DATE_SLICE but returns time only.' },
  TO_DATE: { summary: 'Cast a datetime to DATE (truncate time).' },
  TO_UNIX_TIMESTAMP: { summary: 'Convert a datetime to UNIX epoch (seconds).' },
  UNIX_TIMESTAMP: { summary: 'Same as TO_UNIX_TIMESTAMP, or NOW() as epoch when no arg.' },
  WEEK_OF_YEAR: { summary: 'Week number within the year (1-53).' },
  CURRENT_VERSION: { summary: 'Return the StarRocks server version string.' },

  // ── DDL / dialect-specific clauses ──────────────────────────────────
  DUPLICATE: {
    summary: 'DUPLICATE KEY (cols) — table model where rows are appended verbatim. Fastest writes, no de-dup.',
    example:
      "CREATE TABLE events (\n  ts DATETIME, user_id BIGINT, event VARCHAR(64)\n)\nDUPLICATE KEY(ts, user_id)\nDISTRIBUTED BY HASH(user_id) BUCKETS 32;"
  },
  AGGREGATE: {
    summary: 'AGGREGATE KEY (cols) — table model that pre-aggregates value columns by their declared aggregator (SUM, REPLACE, BITMAP_UNION, HLL_UNION, …).',
    example:
      "CREATE TABLE daily_users (\n  day DATE,\n  user_bitmap BITMAP BITMAP_UNION\n)\nAGGREGATE KEY(day)\nDISTRIBUTED BY HASH(day) BUCKETS 8;"
  },
  UNIQUE: {
    summary: 'UNIQUE KEY (cols) — upsert-like model: later rows with the same key overwrite earlier ones.',
    example:
      "CREATE TABLE user_profile (\n  user_id BIGINT, name VARCHAR(64), updated DATETIME\n)\nUNIQUE KEY(user_id)\nDISTRIBUTED BY HASH(user_id) BUCKETS 16;"
  },
  DISTRIBUTED: {
    summary: 'DISTRIBUTED BY HASH(...) BUCKETS N — controls how rows are sharded across tablets.',
    example: 'DISTRIBUTED BY HASH(user_id) BUCKETS 32'
  },
  PARTITION: {
    summary: 'PARTITION BY RANGE(...) — define data partitions; dynamic partitions auto-create over time via PROPERTIES.',
    example:
      "PARTITION BY RANGE(day) (\n  PARTITION p202401 VALUES LESS THAN ('2024-02-01'),\n  PARTITION p202402 VALUES LESS THAN ('2024-03-01')\n)"
  },
  PROPERTIES: {
    summary: 'Table options block: replication, storage, dynamic-partition rules, etc.',
    example:
      "PROPERTIES (\n  'replication_num' = '3',\n  'dynamic_partition.enable' = 'true',\n  'dynamic_partition.time_unit' = 'DAY',\n  'dynamic_partition.start' = '-30',\n  'dynamic_partition.end' = '3'\n)"
  },
  ROLLUP: {
    summary: 'Materialized rollup index on a subset of columns — speeds up specific query shapes.',
    example: "ALTER TABLE events ADD ROLLUP r_country_day(day, country, user_bitmap);"
  },
  MATERIALIZED: {
    summary: 'MATERIALIZED VIEW — a query result kept fresh by StarRocks. Used for OLAP acceleration.',
    example:
      "CREATE MATERIALIZED VIEW mv_dau AS\nSELECT day, BITMAP_UNION(TO_BITMAP(user_id)) AS user_bitmap\nFROM events GROUP BY day;"
  },
  BROKER: {
    summary: 'BROKER LOAD — ingest external data via a configured broker (S3/HDFS/etc.).',
    example: "LOAD LABEL events_2024 (DATA INFILE('hdfs://…/events.parq') INTO TABLE events) WITH BROKER 'broker0';"
  },
  ROUTINE: {
    summary: 'ROUTINE LOAD — continuous streaming ingest, e.g. from Kafka.',
    example:
      "CREATE ROUTINE LOAD events_kafka ON events\nCOLUMNS (ts, user_id, event)\nPROPERTIES('format' = 'json')\nFROM KAFKA('kafka_broker_list' = '…', 'kafka_topic' = 'events');"
  },
  STREAM: {
    summary: 'STREAM LOAD — push data via HTTP. Use the curl-based loader (no SQL syntax in the editor).'
  },

  // ── Misc utility ─────────────────────────────────────────────────────
  IFNULL: { summary: 'Return the second argument if the first is NULL.' },
  NVL: { summary: 'Synonym for IFNULL.' },
  NULLIF: { summary: 'Return NULL if the two args are equal, otherwise the first.' },
  IF: {
    summary: 'IF(cond, then, else) — ternary.',
    example: "SELECT IF(score >= 80, 'pass', 'fail') FROM grades;"
  },
  REGEXP_EXTRACT: {
    summary: 'First regex match (or empty string).',
    signature: 'REGEXP_EXTRACT(string, pattern, group_idx)',
    example: "SELECT REGEXP_EXTRACT('order #1234', '#(\\\\d+)', 1);   -- '1234'"
  },
  REGEXP_REPLACE: { summary: 'Replace all regex matches with a literal.' },
  SPLIT_PART: {
    summary: 'Nth (1-based) part of a delimited string.',
    example: "SELECT SPLIT_PART('a:b:c', ':', 2);   -- 'b'"
  },
  INSTR: { summary: '1-based position of a substring (0 if not found).' },
  REPLACE: { summary: 'Replace all occurrences of a substring.' },
  REPEAT: { summary: 'Repeat a string N times.' },
  REVERSE: { summary: 'Reverse a string or an array.' }
};

const SQLITE_DOCS: Record<string, ISqlDoc> = {
  PRAGMA: {
    summary: 'SQLite directive — query or modify connection/database settings.',
    example: 'PRAGMA table_info(users);'
  },
  GLOB: {
    summary: "Pattern match using Unix shell glob syntax (*, ?). Case-sensitive (unlike LIKE).",
    example: "SELECT * FROM files WHERE path GLOB '*.log';"
  }
};

const MSSQL_DOCS: Record<string, ISqlDoc> = {
  TOP: {
    summary: 'SQL Server: limit rows returned (placed right after SELECT, unlike LIMIT).',
    example: 'SELECT TOP 10 * FROM events ORDER BY ts DESC;'
  },
  OFFSET: {
    summary: 'Skip N rows. SQL Server requires ORDER BY when using OFFSET ... FETCH.',
    example: 'SELECT * FROM events ORDER BY ts OFFSET 100 ROWS FETCH NEXT 10 ROWS ONLY;'
  },
  ISNULL: {
    summary: 'SQL Server: return the second argument if the first is NULL. (Not standard COALESCE.)',
    example: "SELECT ISNULL(nickname, 'anon') FROM users;"
  }
};

const ORACLE_DOCS: Record<string, ISqlDoc> = {
  ROWNUM: {
    summary: 'Pseudo-column: sequence number Oracle assigns to a row before ORDER BY.',
    example: 'SELECT * FROM users WHERE ROWNUM <= 10;'
  },
  CONNECT: {
    summary: 'CONNECT BY: Oracle hierarchical query.',
    example: 'SELECT name FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id;'
  },
  NVL: { summary: 'Oracle: return the second argument when the first is NULL.' }
};

const PER_DIALECT: Partial<Record<ConnType, Record<string, ISqlDoc>>> = {
  [ConnType.DB_PGSQL]: PG_DOCS,
  [ConnType.DB_MYSQL]: MYSQL_DOCS,
  [ConnType.DB_TRINO]: TRINO_DOCS,
  [ConnType.DB_HIVE_LDAP]: HIVE_DOCS,
  [ConnType.DB_HIVE_KERBEROS]: HIVE_DOCS,
  [ConnType.DB_STARROCKS]: STARROCKS_DOCS,
  [ConnType.DB_SQLITE]: SQLITE_DOCS,
  [ConnType.DB_SQLSERVER]: MSSQL_DOCS,
  [ConnType.DB_ORACLE]: ORACLE_DOCS
};

/** Look up a doc entry. Per-dialect overrides take precedence over generics. */
export function lookupDoc(
  label: string,
  connType: ConnType | null
): ISqlDoc | null {
  const key = label.toUpperCase();
  if (connType !== null) {
    const d = PER_DIALECT[connType];
    if (d && d[key]) {
      return d[key];
    }
  }
  return GENERIC[key] || null;
}

/** Render an ISqlDoc as a CodeMirror autocomplete info-panel node. */
export function renderDocInfo(label: string, doc: ISqlDoc): HTMLElement {
  const root = document.createElement('div');
  root.className = 'jp-sql-doc';

  const title = document.createElement('div');
  title.className = 'jp-sql-doc-title';
  title.textContent = doc.signature || label;
  root.appendChild(title);

  if (doc.summary) {
    const p = document.createElement('div');
    p.className = 'jp-sql-doc-summary';
    p.textContent = doc.summary;
    root.appendChild(p);
  }

  if (doc.example) {
    const lbl = document.createElement('div');
    lbl.className = 'jp-sql-doc-example-label';
    lbl.textContent = 'Example';
    root.appendChild(lbl);

    const pre = document.createElement('pre');
    pre.className = 'jp-sql-doc-example';
    pre.textContent = doc.example;
    root.appendChild(pre);
  }
  return root;
}
