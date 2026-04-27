# Agent workflow

Five agents collaborate on changes:

```
                     ┌──────────────────┐
                     │   architect      │ designs end-to-end, asks user to validate
                     └────────┬─────────┘
                              │ (user approves)
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌────────────────┐                          ┌────────────────┐
│ test-engineer  │  red phase               │   parallel:    │
│ (it.todo stubs)│                          │ backend-dev +  │
└────────┬───────┘                          │ frontend-dev   │
         │                                  └────────┬───────┘
         └──────────────────┬──────────────────────────┘
                            ▼
                  ┌──────────────────┐
                  │ test-engineer    │ green phase: fill in tests, run unit/integ/e2e
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │   doc-keeper     │ reads diff, updates affected docs
                  └──────────────────┘
```

## When to use which agent

| Use case | Agent |
|---|---|
| Non-trivial feature, schema change, refactor | start with **architect** |
| Implementing tasks from an approved design | **backend-dev** + **frontend-dev** |
| Writing or running tests | **test-engineer** |
| After a feature lands | **doc-keeper** |
| Typo fix, single-line tweak | direct edit, no agents |
| Bug fix with obvious cause | direct edit; if it changes a pattern, run doc-keeper after |

## Hand-off contract

Each agent has a defined "what I produce" and "what I expect" from the previous agent. This is in their system prompt — don't bypass it.

- **architect → user**: design doc with named sections (Goal / Data model / API surface / Frontend / Activity events / Test plan / Implementation handoff). Stops and asks for validation.
- **architect → test-engineer**: the "Test plan handoff" section is the input.
- **architect → backend-dev / frontend-dev**: the "Backend tasks" / "Frontend tasks" checklists are the input.
- **test-engineer → devs (red phase)**: failing test files committed; devs make them green.
- **devs → test-engineer (green phase)**: implementation merged; test-engineer fills in test bodies and runs the suite.
- **anything → doc-keeper**: after meaningful changes, doc-keeper reads `git diff` and updates affected CLAUDE.md / docs files.

## Why this is sized this way

Splitting the work into roles lets each agent's system prompt stay narrow and high-signal. Each invocation only loads:

- The agent's own system prompt (role + scope guards)
- Auto-loaded `CLAUDE.md` files for whatever directory it's working in
- Files it explicitly `Read`s

A backend-dev never loads `web/CLAUDE.md` and never sees frontend hook code unless it explicitly grabs it. Context stays cheap.

See [adr/0004-agent-and-knowledge-architecture.md](adr/0004-agent-and-knowledge-architecture.md) for the reasoning.
