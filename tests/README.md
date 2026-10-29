# Sales regression checks

Run `npm test` (or `npm run test:sales`) from the project root.

The suite uses Node's built-in test runner and the project's existing esbuild
installation; it requires no new packages or credentials. It exercises the real
Express budget, daily log, historical/bulk import, edit and Insights endpoints,
the real storage calculations and validation schemas, the CSV helpers used by
the historical import dialog, and server-rendered sales/budget totals.

The runner substitutes an in-memory Drizzle boundary before importing the
server database module. It never connects to a development or production
database. Email delivery is disabled and the AI client has a dummy key and
unreachable local endpoint. Tests assert explicit expected amounts independently
of the production calculations.

Covered cases:
- Catering-only and mixed-category club budgets; partial updates and zero clears.
- Four-category daily logs, including an incorrect client-supplied total.
- Catering-only edits, recomputed persisted totals, and zero clears.
- Legacy three-category CSV imports preserving an existing Catering amount.
- Four-category CSV aliases, Catering-only rows, and explicit zero imports.
- Insights summaries, daily breakdowns, category totals, top days, date-range
  aggregation and club isolation.
- RFC 4180 quoting used by sales and maintenance CSV imports.

This is an offline regression suite, not a PostgreSQL integration test or a
browser-interaction test. The database fixture only implements the query
operations needed by these cases, and fails on unsupported sales predicates.