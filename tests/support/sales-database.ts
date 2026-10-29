import { getTableColumns, getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

type Row = Record<string, any>;
const tables = new Map<string, Row[]>();
const dialect = new PgDialect();

export function resetSalesDatabase() {
  tables.clear();
}

export function savedRows(name: string): Row[] {
  return structuredClone(tables.get(name) ?? []);
}

/**
 * Small Drizzle boundary fake, not a replacement for the sales implementation.
 * Storage methods, Zod schemas, route handlers and totals all run unchanged.
 * Supports only the predicates used by those paths; unexpected SQL fails.
 */
class Query implements PromiseLike<Row[]> {
  private table!: Table;
  private condition?: SQL;
  private data?: Row | Row[];
  private max?: number;

  constructor(private operation: "select" | "insert" | "update" | "delete", private fields?: Row) {}
  from(table: Table) { this.table = table; return this; }
  where(condition: SQL) { this.condition = condition; return this; }
  values(data: Row | Row[]) { this.data = data; return this; }
  set(data: Row) { this.data = data; return this; }
  limit(max: number) { this.max = max; return this; }
  orderBy(..._args: unknown[]) { return this; }
  innerJoin(..._args: unknown[]) { return this; }
  leftJoin(..._args: unknown[]) { return this; }
  returning() { return this; }
  onConflictDoNothing() { return this; }

  private matches(row: Row): boolean {
    if (!this.condition) return true;
    const { sql, params } = dialect.sqlToQuery(this.condition);
    // Sales paths use conjunctions of equality/date bounds. Maintenance tables
    // are always empty, so their more complex predicates aren't evaluated.
    if (/\bor\b|\bis\b/i.test(sql)) throw new Error(`Unsupported test predicate: ${sql}`);
    const columns = getTableColumns(this.table);
    const terms = [...sql.matchAll(/"[^"]+"\."([^"]+)"\s*(=|>=|<=)\s*\$(\d+)/g)];
    if (!terms.length) throw new Error(`Unsupported test predicate: ${sql}`);
    return terms.every(([, name, operator, parameter]) => {
      const key = Object.keys(columns).find(key => columns[key].name === name);
      if (!key) throw new Error(`Unknown column: ${name}`);
      const value = params[Number(parameter) - 1] as any;
      return operator === "=" ? row[key] === value
        : operator === ">=" ? row[key] >= value : row[key] <= value;
    });
  }

  private normalize(data: Row): Row {
    const columns = getTableColumns(this.table);
    return Object.fromEntries(Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        value != null && columns[key]?.getSQLType().startsWith("numeric")
          ? Number(value).toFixed(2) : value,
      ]));
  }

  private execute(): Row[] {
    const name = getTableName(this.table);
    const rows = tables.get(name) ?? [];
    tables.set(name, rows);
    if (this.operation === "insert") {
      const inserted = (Array.isArray(this.data) ? this.data : [this.data!]).map(data => {
        const row = { id: rows.length + 1, ...this.normalize(data) };
        rows.push(row);
        return row;
      });
      return structuredClone(inserted);
    }
    const matches = rows.filter(row => this.matches(row));
    if (this.operation === "update") {
      matches.forEach(row => Object.assign(row, this.normalize(this.data as Row)));
      return structuredClone(matches);
    }
    if (this.operation === "delete") {
      tables.set(name, rows.filter(row => !matches.includes(row)));
      return [];
    }
    if (this.fields && "c" in this.fields) return [{ c: matches.length }];
    if (this.fields && "oldest" in this.fields) {
      const dates = matches.map(row => row.logDate).sort();
      return [{ oldest: dates[0], newest: dates.at(-1) }];
    }
    return structuredClone(this.max === undefined ? matches : matches.slice(0, this.max));
  }

  then<TResult1 = Row[], TResult2 = never>(
    resolve?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }
}

export const db = {
  select: (fields?: Row) => new Query("select", fields),
  insert: (table: Table) => new Query("insert").from(table),
  update: (table: Table) => new Query("update").from(table),
  delete: (table: Table) => new Query("delete").from(table),
};