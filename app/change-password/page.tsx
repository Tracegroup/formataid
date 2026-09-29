"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client";

export default function ChangePasswordPage() {
  const [me, setMe] = useState<{ name: string; mustChangePassword: boolean } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ user: { name: string; mustChangePassword: boolean } }>("/api/me")
      .then((r) => setMe(r.user))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      await api("/api/auth/change-password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      // Full reload so the server re-reads the refreshed session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const firstTime = me?.mustChangePassword ?? true;

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{firstTime ? "Set your password" : "Change password"}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          {firstTime
            ? `Welcome${me?.name ? `, ${me.name}` : ""}. Replace the one-time password you were given with your own.`
            : "Enter your current password and choose a new one."}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">{firstTime ? "One-time password" : "Current password"}</Label>
            <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
            <p className="text-xs text-muted-foreground">At least 10 characters, with letters and numbers.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" className="w-full h-9 bg-[#1B3566] hover:bg-[#1B3566]/90" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </Button>
          {!firstTime && (
            <Link href="/" className="block text-center text-xs text-muted-foreground hover:underline">
              Cancel
            </Link>
          )}
        </form>
      </div>
    </main>
  );
}
