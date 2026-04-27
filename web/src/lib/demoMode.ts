// Resolved at build time by Vite. When true, the app skips Supabase entirely
// and uses the in-memory demo store under web/src/lib/demo/.
export const DEMO_MODE =
  String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";
