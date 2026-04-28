import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { supabase } from "../src/supabase.js";

type Row = {
  "Task ID": string;
  "Created At": string;
  "Completed At": string;
  "Last Modified": string;
  Name: string;
  "Section/Column": string;
  Assignee: string;
  "Assignee Email": string;
  "Start Date": string;
  "Due Date": string;
  Tags: string;
  Notes: string;
  Projects: string;
  "Parent task": string;
  "Blocked By (Dependencies)": string;
  "Blocking (Dependencies)": string;
  Priority: string;
};

const UMBRELLA = "Weekly Planning";
const FALLBACK_PROJECT = "Other";

const STATUS_MAP: Record<
  string,
  "todo" | "in_progress" | "waiting_for_reply" | "done"
> = {
  "To-Do": "todo",
  "In-Progress": "in_progress",
  "Waiting for Reply": "waiting_for_reply",
  Done: "done",
};

const PRIORITY_COLOR: Record<string, string> = {
  Low: "#16a34a",
  Medium: "#eab308",
  High: "#ef4444",
};

function splitProjects(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickPrimary(projects: string[]): string {
  const nonUmbrella = projects.filter((p) => p !== UMBRELLA);
  return nonUmbrella[0] ?? projects[0] ?? FALLBACK_PROJECT;
}

async function assertEmpty() {
  const { count, error } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new Error(
      "projects table is not empty. To re-seed, truncate tables first:\n" +
        "  truncate task_tags, comments, tasks, tags, projects restart identity cascade;"
    );
  }
}

async function insertProjects(names: string[]) {
  const rows = names.map((name, i) => ({ name, position: i + 1 }));
  const { data, error } = await supabase
    .from("projects")
    .insert(rows)
    .select("id, name");
  if (error) throw error;
  return new Map(data!.map((p) => [p.name, p.id] as const));
}

async function insertTags(names: string[]) {
  if (!names.length) return new Map<string, string>();
  const rows = names.map((name) => ({
    name,
    color: PRIORITY_COLOR[name] ?? "#64748b",
  }));
  const { data, error } = await supabase
    .from("tags")
    .insert(rows)
    .select("id, name");
  if (error) throw error;
  return new Map(data!.map((t) => [t.name, t.id] as const));
}

async function main() {
  const csvPath =
    process.env.SEED_CSV_PATH ??
    `${process.env.HOME}/Downloads/Weekly_Planning.csv`;
  console.log("Reading CSV:", csvPath);
  const raw = readFileSync(csvPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: false,
  }) as Row[];
  console.log(`Parsed ${rows.length} rows`);

  await assertEmpty();

  const projectSet = new Set<string>([FALLBACK_PROJECT]);
  const tagSet = new Set<string>();
  for (const r of rows) {
    for (const p of splitProjects(r.Projects)) {
      if (p !== UMBRELLA) projectSet.add(p);
    }
    if (r.Priority) tagSet.add(r.Priority);
  }
  const projectNames = [...projectSet];
  console.log("Projects:", projectNames);

  const projectIdByName = await insertProjects(projectNames);
  const tagIdByName = await insertTags([...tagSet]);

  // Split rows: top-level vs subtask (Parent task is a NAME string).
  const topRows = rows.filter((r) => !r["Parent task"]);
  const subRows = rows.filter((r) => r["Parent task"]);

  const topByName = new Map<string, Row>();
  for (const r of topRows) topByName.set(r.Name, r);

  const csvIdToDbId = new Map<string, string>();
  const topLevelPayloads = topRows.map((r) => {
    const projects = splitProjects(r.Projects);
    const primary = pickPrimary(projects);
    const projectId =
      projectIdByName.get(primary) ?? projectIdByName.get(FALLBACK_PROJECT)!;
    return {
      csvId: r["Task ID"],
      row: {
        project_id: projectId,
        name: r.Name,
        description: r.Notes ?? "",
        status: STATUS_MAP[r["Section/Column"]] ?? "todo",
        due_date: r["Due Date"] || null,
        completed_at: r["Completed At"]
          ? new Date(r["Completed At"]).toISOString()
          : null,
        created_at: r["Created At"]
          ? new Date(r["Created At"]).toISOString()
          : new Date().toISOString(),
      },
      priority: r.Priority,
    };
  });

  const { data: insertedTop, error: topErr } = await supabase
    .from("tasks")
    .insert(topLevelPayloads.map((p) => p.row))
    .select("id, name, project_id, created_at");
  if (topErr) throw topErr;

  // Match back to CSV rows. Inserted order matches payload order in supabase-js.
  for (let i = 0; i < insertedTop!.length; i++) {
    csvIdToDbId.set(topLevelPayloads[i].csvId, insertedTop![i].id);
  }
  const dbIdByName = new Map<string, { id: string; project_id: string }>();
  for (let i = 0; i < insertedTop!.length; i++) {
    dbIdByName.set(topLevelPayloads[i].row.name, {
      id: insertedTop![i].id,
      project_id: topLevelPayloads[i].row.project_id,
    });
  }

  // Priority tag attachments for top-level.
  const taskTagRows: { task_id: string; tag_id: string }[] = [];
  for (let i = 0; i < topLevelPayloads.length; i++) {
    const p = topLevelPayloads[i];
    if (!p.priority) continue;
    const tagId = tagIdByName.get(p.priority);
    if (tagId) taskTagRows.push({ task_id: insertedTop![i].id, tag_id: tagId });
  }

  // Subtasks — inherit parent's project_id, look up parent by NAME.
  const subPayloads = subRows
    .map((r) => {
      const parent = dbIdByName.get(r["Parent task"]);
      if (!parent) {
        console.warn(`  ⚠ Parent "${r["Parent task"]}" not found for "${r.Name}" — skipping`);
        return null;
      }
      return {
        row: {
          project_id: parent.project_id,
          parent_task_id: parent.id,
          name: r.Name,
          description: r.Notes ?? "",
          status: STATUS_MAP[r["Section/Column"]] ?? "todo",
          due_date: r["Due Date"] || null,
          completed_at: r["Completed At"]
            ? new Date(r["Completed At"]).toISOString()
            : null,
          created_at: r["Created At"]
            ? new Date(r["Created At"]).toISOString()
            : new Date().toISOString(),
        },
        csvId: r["Task ID"],
        priority: r.Priority,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (subPayloads.length) {
    const { data: insertedSubs, error: subErr } = await supabase
      .from("tasks")
      .insert(subPayloads.map((p) => p.row))
      .select("id");
    if (subErr) throw subErr;
    for (let i = 0; i < subPayloads.length; i++) {
      csvIdToDbId.set(subPayloads[i].csvId, insertedSubs![i].id);
      if (subPayloads[i].priority) {
        const tagId = tagIdByName.get(subPayloads[i].priority);
        if (tagId)
          taskTagRows.push({ task_id: insertedSubs![i].id, tag_id: tagId });
      }
    }
  }

  if (taskTagRows.length) {
    const { error: ttErr } = await supabase.from("task_tags").insert(taskTagRows);
    if (ttErr) throw ttErr;
  }

  console.log(
    `✔ Seeded: ${projectNames.length} projects, ${insertedTop!.length} top tasks, ${subPayloads.length} subtasks, ${taskTagRows.length} tag attachments`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
