# api/ — Vercel function wrapper

Single serverless function that re-exports the Express app from `server/`. Exists because Vercel's file-based routing reserves `/api/*.ts` for serverless functions.

```
api/
├── index.ts        ← strips /api prefix from req.url, hands off to Express
├── package.json    ← {"type": "module"}  ← THIS IS LOAD-BEARING
└── tsconfig.json   ← typecheck only (Vercel does its own bundling)
```

## What it does

```ts
req.url = req.url.replace(/^\/api(?=\/|$)/, "") || "/";
return app(req, res);  // Express app from ../server/src/app.js
```

## Hard rules

- **`api/package.json` must declare `"type": "module"`**. Without it, Vercel's Node runtime treats the compiled output as CommonJS and the `import` statements fail at runtime with `Cannot use import statement outside a module`. Don't delete this file.
- **Don't rename `index.ts` to `index.mts`**. Vercel's file-based routing only auto-detects `.ts` and `.js`; `.mts` produces a 404 because the function isn't registered.
- **Don't add other files here**. New routes go in `server/src/routes/`. Express handles routing inside the wrapped function — Vercel sees one function regardless.

## Why one function (not per-route)

Vercel rewrite in [vercel.json](../vercel.json) sends `/api/(.*)` → `/api`. Every request lands at this single function, then Express routes internally. Pros: shared middleware (auth), shared DB connection pool warm-up, one cold-start surface. Cons: can't fine-tune per-route concurrency (not needed for this app).

See [docs/adr/0001-vercel-single-project.md](../docs/adr/0001-vercel-single-project.md) for the full reasoning.
