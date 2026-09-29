"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCopy, KeyRound, UserPlus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, copyToClipboard, errorMessage } from "@/lib/client";
import type { Role } from "@/lib/session";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const ROLE_LABELS: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", user: "User" };
const ROLE_HELP: Record<Role, string> = {
  user: "Formats reports and sees their own formatting history.",
  admin: "Sees everyone's formatting history; views AI usage.",
  super_admin: "Everything, including users and the default AI model.",
};

function OtpReveal({ email, otp, onDone }: { email: string; otp: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Your TCG Format Assist account is ready.\n\nSign in at: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${email}\nOne-time password: ${otp}\n\nYou'll be asked to choose your own password when you first sign in.`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        Share this one-time password with <strong>{email}</strong>. It is shown only once — they must change it when they first sign in.
      </p>
      <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 font-mono text-base tracking-wider">
        {otp}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            setCopied(await copyToClipboard(message));
          }}
        >
          {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied" : "Copy invite message"}
        </Button>
        <Button className="bg-[#1B3566] hover:bg-[#1B3566]/90" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export default function UsersAdmin({ meId }: { meId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "user" as Role });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ email: string; otp: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<UserRow | null>(null);

  const load = useCallback(
    () =>
      api<{ users: UserRow[] }>("/api/admin/users")
        .then((r) => setUsers(r.users))
        .catch((err) => setError(errorMessage(err))),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const r = await api<{ oneTimePassword: string }>("/api/admin/users", { method: "POST", json: form });
      setCreating(false);
      setReveal({ email: form.email.trim().toLowerCase(), otp: r.oneTimePassword });
      setForm({ name: "", email: "", role: "user" });
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(u: UserRow, body: Record<string, unknown>) {
    setError("");
    try {
      const r = await api<{ oneTimePassword?: string }>(`/api/admin/users/${u.id}`, { method: "PATCH", json: body });
      if (r.oneTimePassword) setReveal({ email: u.email, otp: r.oneTimePassword });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Users"
        description="Only super admins can add users. New users get a one-time password and must set their own at first sign-in."
        actions={
          <Button className="h-9 bg-[#1B3566] hover:bg-[#1B3566]/90" onClick={() => setCreating(true)}>
            <UserPlus /> Add user
          </Button>
        }
      />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {users === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last sign-in</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const self = u.id === meId;
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">
                        {u.name} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Select value={u.role} disabled={self} onChange={(e) => update(u, { role: e.target.value })} className="w-36" aria-label="Role">
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {!u.active ? (
                        <span className="text-red-600">Deactivated</span>
                      ) : u.mustChangePassword ? (
                        <span className="text-amber-600">Awaiting first sign-in</span>
                      ) : (
                        <span className="text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button size="xs" variant="outline" onClick={() => setConfirmReset(u)}>
                        <KeyRound /> Reset password
                      </Button>{" "}
                      {!self && (
                        <Button size="xs" variant="ghost" onClick={() => update(u, { active: !u.active })}>
                          {u.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
          <p key={r}>
            <strong className="text-slate-700">{ROLE_LABELS[r]}:</strong> {ROLE_HELP[r]}
          </p>
        ))}
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Add user">
        <form onSubmit={create} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-role">Role</Label>
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HELP[form.role]}</p>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#1B3566] hover:bg-[#1B3566]/90" disabled={busy}>
              Create & get one-time password
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!confirmReset}
        onClose={() => setConfirmReset(null)}
        title="Reset password?"
        description={`${confirmReset?.email} will be signed out and must sign in with a new one-time password.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmReset(null)}>
            Cancel
          </Button>
          <Button
            className="bg-[#1B3566] hover:bg-[#1B3566]/90"
            onClick={() => {
              const u = confirmReset!;
              setConfirmReset(null);
              update(u, { resetPassword: true });
            }}
          >
            Reset
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!reveal} onClose={() => setReveal(null)} title="One-time password">
        {reveal && <OtpReveal email={reveal.email} otp={reveal.otp} onDone={() => setReveal(null)} />}
      </Dialog>
    </div>
  );
}
