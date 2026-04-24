import { useState } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { signInWith } = useAuth();
  const [busy, setBusy] = useState<"github" | "google" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(provider: "github" | "google") {
    setBusy(provider);
    setErr(null);
    try {
      await signInWith(provider);
    } catch (e: any) {
      setErr(e?.message ?? "Sign-in failed");
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 to-blue-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600" />
          <div>
            <div className="text-base font-semibold">Weekly Planning</div>
            <div className="text-xs text-ink-500">Sign in to continue</div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => go("github")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-300 bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .5C5.4.5 0 5.9 0 12.6c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6C20.6 22.4 24 17.9 24 12.6 24 5.9 18.6.5 12 .5z" />
            </svg>
            {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
          </button>
          <button
            onClick={() => go("google")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3L37.6 9.3C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.9 24 12.9c3 0 5.8 1.1 7.9 3L37.6 9.3C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.5-7.2 2.5-5.2 0-9.6-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C41.2 35.3 44 30 44 24c0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            {busy === "google" ? "Redirecting…" : "Continue with Google"}
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        )}

        <p className="mt-6 text-[11px] text-ink-500">
          Auth is handled by Supabase. By signing in you grant this app read
          access to your name and email.
        </p>
      </div>
    </div>
  );
}
