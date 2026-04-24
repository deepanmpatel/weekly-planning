// Vercel serverless function that wraps the Express app.
// Vercel exposes every file under /api/*.ts as a function; vercel.json rewrites
// /api/(.*) → /api so all Express routes pass through this single handler.

import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../server/src/app.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Strip the /api prefix so Express sees its own routes (/projects, /tasks, ...).
  if (req.url) {
    req.url = req.url.replace(/^\/api(?=\/|$)/, "") || "/";
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(
    req,
    res
  );
}

// Prevent Vercel from imposing the default 10s body parse; Express handles bodies.
export const config = {
  api: { bodyParser: false },
};
