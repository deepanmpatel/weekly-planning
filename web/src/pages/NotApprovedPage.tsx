import { useAuth } from "../lib/auth";
import { useMe } from "../lib/api";

export function NotApprovedPage() {
  const { signOut } = useAuth();
  const { data: me } = useMe();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 to-rose-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 shadow-card">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            ⛔
          </div>
          <div>
            <div className="text-base font-semibold">Access required</div>
            <div className="text-xs text-ink-500">
              Your email isn't on the allowlist
            </div>
          </div>
        </div>

        <p className="text-sm text-ink-700">
          You signed in as{" "}
          <span className="font-medium text-ink-900">{me?.email}</span>, but
          this email isn't approved to use this app yet.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          Ask an admin to add your email, then sign in again.
        </p>

        <button
          onClick={() => signOut()}
          className="mt-6 w-full rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
