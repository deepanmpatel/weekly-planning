import { useState } from "react";
import {
  useAddAllowedEmail,
  useAllowedEmails,
  useMe,
  useRemoveAllowedEmail,
  useSetUserAdmin,
  useUsers,
} from "../lib/api";
import { Avatar } from "../components/Avatar";

export function AdminPage() {
  const { data: me } = useMe();
  const { data: emails = [], isLoading, error } = useAllowedEmails();
  const { data: users = [] } = useUsers();
  const addEmail = useAddAllowedEmail();
  const removeEmail = useRemoveAllowedEmail();
  const setAdmin = useSetUserAdmin();

  const [newEmail, setNewEmail] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    try {
      await addEmail.mutateAsync(email);
      setNewEmail("");
    } catch (err: any) {
      setFormErr(
        err?.message === "already_allowed"
          ? "That email is already on the list."
          : err?.message ?? "Failed to add email"
      );
    }
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error.message === "admin_required"
            ? "You need admin permissions to view this page."
            : `Couldn't load admin data: ${error.message}`}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-ink-200 bg-white px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Admin
        </div>
        <h1 className="text-xl font-semibold text-ink-900">Access control</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2">
          {/* Allowlist */}
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-ink-900">
                Allowed emails
              </h2>
              <p className="text-xs text-ink-500">
                Only these emails can access tasks. Removing an email locks
                that user out on their next request.
              </p>
            </div>

            <form onSubmit={submit} className="mb-4 flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="someone@example.com"
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={!newEmail.trim() || addEmail.isPending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </form>
            {formErr && (
              <div className="mb-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {formErr}
              </div>
            )}

            {isLoading ? (
              <div className="text-sm text-ink-500">Loading…</div>
            ) : emails.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
                No emails on the allowlist yet.
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {emails.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-ink-900">{e.email}</span>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${e.email}? They'll lose access immediately.`
                          )
                        ) {
                          removeEmail.mutate(e.id);
                        }
                      }}
                      className="rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Users / admins */}
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-ink-900">
                Signed-in users
              </h2>
              <p className="text-xs text-ink-500">
                Toggle admin to let someone manage this page.
              </p>
            </div>

            {users.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
                No one has signed in yet.
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {users.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 py-2"
                    >
                      <Avatar user={u} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-900">
                          {u.display_name ?? u.email}
                          {isMe && (
                            <span className="ml-1 text-[10px] font-normal text-ink-500">
                              (you)
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-ink-500">
                          {u.email}
                        </div>
                      </div>
                      <label
                        className={`flex items-center gap-1.5 text-xs ${
                          isMe ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                        }`}
                        title={isMe ? "You can't demote yourself" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={u.is_admin === true}
                          disabled={isMe || setAdmin.isPending}
                          onChange={(e) =>
                            setAdmin.mutate({
                              id: u.id,
                              is_admin: e.target.checked,
                            })
                          }
                        />
                        Admin
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
