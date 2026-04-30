// Tiny in-memory Supabase mock used by route tests.
//
// Goal: support the subset of supabase-js query builder used by the routes —
// .from().select().eq()...single()/maybeSingle(), .update().eq()...select().single(),
// .insert().select().single(), .delete().eq(), .order/.limit/.in/.is/.lt/.ilike
// chains — backed by simple in-memory arrays.
//
// This is a TEST-ONLY shim. Routes import `supabase` from "../supabase.js";
// each test file does `vi.mock("../src/supabase.js", () => ({ supabase: mock }))`.
//
// Note for backend-dev: this mock encodes assumptions about how the routes
// drive the supabase-js builder. If you refactor routes to use a different
// query shape, update this mock accordingly.

interface Filters {
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  lt: Array<[string, unknown]>;
  ilike: Array<[string, string]>;
}

type Row = Record<string, unknown>;

interface QueryState {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  selection?: string;
  insertRow?: Row | Row[];
  updateRow?: Row;
  filters: Filters;
  orderBy: Array<{ column: string; ascending: boolean }>;
  limitN?: number;
}

function newFilters(): Filters {
  return { eq: [], is: [], in: [], lt: [], ilike: [] };
}

function rowMatches(row: Row, f: Filters): boolean {
  for (const [k, v] of f.eq) if (row[k] !== v) return false;
  for (const [k, v] of f.is) if (row[k] !== v) return false;
  for (const [k, vs] of f.in) if (!vs.includes(row[k])) return false;
  for (const [k, v] of f.lt) if (!(typeof row[k] === "string" && (row[k] as string) < (v as string))) return false;
  for (const [k, v] of f.ilike) {
    const cell = row[k];
    if (typeof cell !== "string" || cell.toLowerCase() !== v.toLowerCase()) return false;
  }
  return true;
}

export interface SupabaseMockTables {
  [table: string]: Row[];
}

export interface SupabaseMockHandle {
  client: any;
  tables: SupabaseMockTables;
  insertedEvents: Row[];
}

export function createSupabaseMock(seed: SupabaseMockTables = {}): SupabaseMockHandle {
  const tables: SupabaseMockTables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  if (!tables.task_events) tables.task_events = [];
  const insertedEvents: Row[] = [];

  function startQuery(table: string): any {
    if (!tables[table]) tables[table] = [];
    const state: QueryState = {
      table,
      op: "select",
      filters: newFilters(),
      orderBy: [],
    };

    const builder: any = {};

    builder.select = (sel?: string) => {
      // .select() may follow .insert/.update for returning rows; preserve op.
      state.selection = sel;
      if (state.op === "insert" || state.op === "update" || state.op === "delete") return builder;
      state.op = "select";
      return builder;
    };
    builder.insert = (row: Row | Row[]) => {
      state.op = "insert";
      state.insertRow = row;
      return builder;
    };
    builder.update = (row: Row) => {
      state.op = "update";
      state.updateRow = row;
      return builder;
    };
    builder.delete = () => {
      state.op = "delete";
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      state.filters.eq.push([col, val]);
      return builder;
    };
    builder.is = (col: string, val: unknown) => {
      state.filters.is.push([col, val]);
      return builder;
    };
    builder.in = (col: string, vals: unknown[]) => {
      state.filters.in.push([col, vals]);
      return builder;
    };
    builder.lt = (col: string, val: unknown) => {
      state.filters.lt.push([col, val]);
      return builder;
    };
    builder.ilike = (col: string, val: string) => {
      state.filters.ilike.push([col, val]);
      return builder;
    };
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      state.orderBy.push({ column, ascending: opts?.ascending !== false });
      return builder;
    };
    builder.limit = (n: number) => {
      state.limitN = n;
      return builder;
    };

    function applyOrder(rows: Row[]): Row[] {
      const out = [...rows];
      out.sort((a, b) => {
        for (const o of state.orderBy) {
          const av = a[o.column];
          const bv = b[o.column];
          if (av === bv) continue;
          if (av == null) return o.ascending ? -1 : 1;
          if (bv == null) return o.ascending ? 1 : -1;
          if (av < bv) return o.ascending ? -1 : 1;
          if (av > bv) return o.ascending ? 1 : -1;
        }
        return 0;
      });
      return out;
    }

    function execute(): { data: any; error: any } {
      const arr = tables[state.table];
      if (state.op === "select") {
        let rows = arr.filter((r) => rowMatches(r, state.filters));
        rows = applyOrder(rows);
        if (state.limitN !== undefined) rows = rows.slice(0, state.limitN);
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      if (state.op === "insert") {
        const inputs = Array.isArray(state.insertRow) ? state.insertRow : [state.insertRow!];
        const newRows = inputs.map((row, i) => {
          const created: Row = {
            id: row.id ?? `mock-${state.table}-${arr.length + i + 1}`,
            ...row,
          };
          arr.push(created);
          if (state.table === "task_events") insertedEvents.push({ ...created });
          return { ...created };
        });
        return { data: newRows, error: null };
      }
      if (state.op === "update") {
        const matched = arr.filter((r) => rowMatches(r, state.filters));
        for (const r of matched) Object.assign(r, state.updateRow);
        return { data: matched.map((r) => ({ ...r })), error: null };
      }
      if (state.op === "delete") {
        const before = arr.length;
        const matchedRows = arr.filter((r) => rowMatches(r, state.filters));
        for (let i = arr.length - 1; i >= 0; i--) {
          if (rowMatches(arr[i], state.filters)) arr.splice(i, 1);
        }
        return { data: matchedRows, error: null };
      }
      return { data: null, error: { message: "unknown op" } };
    }

    builder.single = async () => {
      const r = execute();
      if (r.error) return { data: null, error: r.error };
      const rows = Array.isArray(r.data) ? r.data : [r.data];
      if (!rows.length || rows[0] == null) {
        return { data: null, error: { message: "not found" } };
      }
      return { data: rows[0], error: null };
    };
    builder.maybeSingle = async () => {
      const r = execute();
      if (r.error) return { data: null, error: r.error };
      const rows = Array.isArray(r.data) ? r.data : [r.data];
      return { data: rows[0] ?? null, error: null };
    };

    builder.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(execute()).then(onFulfilled, onRejected);

    return builder;
  }

  const client = {
    from: (table: string) => startQuery(table),
  };

  return { client, tables, insertedEvents };
}
