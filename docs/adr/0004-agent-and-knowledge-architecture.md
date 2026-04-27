# ADR 0004 — Agent roles + scoped knowledge base

Date: 2026-04-26 · Status: accepted

## Context

As the codebase grew (multi-tier app with auth, allowlist, drag-and-drop, activity log), single-conversation context started bloating. Loading the whole codebase into every interaction is wasteful and degrades reasoning. Loading nothing causes agents to invent patterns or duplicate code.

## Decision

Two-layer system:

1. **Specialist agents** in [.claude/agents/](../../.claude/agents/): architect, backend-dev, frontend-dev, test-engineer, doc-keeper. Each has a narrow role and explicit "what I don't do" guard rails. Each only loads its own system prompt; not the others'.
2. **Scoped `CLAUDE.md` hierarchy** auto-loaded by Claude Code based on which directory is active:
   - root CLAUDE.md (everywhere)
   - server/CLAUDE.md (when working in server/)
   - web/CLAUDE.md (when working in web/)
   - api/CLAUDE.md (when working in api/)
   - server/sql/CLAUDE.md (when working in migrations)
3. **`docs/` for depth** — NOT auto-loaded; agents `Read` on demand. ADRs (decisions + why), data-model reference, API contracts.
4. **`doc-keeper` agent** invoked after meaningful changes. Reads `git diff`, updates only affected docs.

## Alternatives considered

- **One mega-CLAUDE.md** at the root. Rejected: agents always pay the full cost regardless of where they're working.
- **Auto-generate docs from code** (e.g. JSDoc → Markdown). Rejected for this size of project: docs about *why* and *patterns* don't extract from code; only *what* does, which is the less valuable half.
- **Separate Confluence/Notion site**. Rejected: agents can't read it without web fetching, and it drifts faster than in-repo docs.
- **No knowledge base; rely on the agent's own search**. Rejected: every agent re-discovers the same conventions, wastes tokens, gets it wrong intermittently.

## Consequences

- **Context cost is roughly linear with where you are**: backend work loads ~150 lines of high-signal CLAUDE.md, not the whole repo. Frontend work doesn't load backend conventions.
- **Knowledge drift is bounded** because the doc-keeper has explicit handoff at the end of every feature. The cost of forgetting to invoke it is one stale doc, not a silent behavioral divergence.
- **New patterns demand an ADR or an update to an existing CLAUDE.md**. If a backend-dev introduces a new convention, doc-keeper captures it; the next backend-dev invocation sees it without re-discovery.
- **Agents stay in their lane**. The architect doesn't write code; the backend-dev doesn't redesign; the test-engineer doesn't paper over bugs. Scope creep gets surfaced as a "stop and ping" rather than silent merging.

## When to revisit

- If agents start needing to load `docs/` files into every invocation, the boundary between "auto-loaded CLAUDE.md" and "on-demand `docs/`" is wrong — fold the hot files up.
- If the doc-keeper starts producing trivial diffs (typos, formatting), tighten its trigger — only invoke after meaningful changes, not every commit.
