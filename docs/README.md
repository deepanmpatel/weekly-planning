# docs/ — depth on demand

These files are **not** auto-loaded into agent context. `Read` them when relevant.

## Index

| File | When to read |
|---|---|
| [data-model.md](data-model.md) | Designing schema changes; understanding table relationships |
| [api-contracts.md](api-contracts.md) | Adding a route; understanding the existing API surface |
| [agent-workflow.md](agent-workflow.md) | First time using the agent system; debugging an unclear handoff |
| [adr/](adr/) | Wondering *why* a load-bearing decision was made |

## ADRs (Architecture Decision Records)

One file per decision that future-you (or a new agent) might second-guess. Format:

```md
# ADR NNNN — <decision in active voice>

Date: YYYY-MM-DD · Status: accepted | superseded | deprecated

## Context
What problem prompted this decision?

## Decision
What we chose.

## Alternatives considered
What else we looked at and why we passed.

## Consequences
What this constrains going forward, and what the upside is.
```

Add a new ADR when:
- Replacing a tool/library
- Changing the auth model or trust boundaries
- Adopting a new pattern that other code should follow
- Choosing between two approaches with non-trivial tradeoffs

Don't ADR trivialities (variable renames, library upgrades within a major).
