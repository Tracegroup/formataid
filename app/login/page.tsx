"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, FileCheck2, Heading, ShieldCheck, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client";

const FEATURES = [
  { icon: Heading, label: "Heading & Text Styles" },
  { icon: Table2, label: "TCG Table Formatting" },
  { icon: ShieldCheck, label: "Content Never Changed" },
  { icon: FileCheck2, label: "Client-Ready .docx" },
];

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ mustChangePassword: boolean }>("/api/auth/login", { method: "POST", json: { email, password } });
      const next = params.get("next");
      window.location.href = res.mustChangePassword ? "/change-password" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="Enter your email address"
          className="h-10"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          className="h-10"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <Button
        type="submit"
        className="mt-2 w-full h-10 bg-linear-to-b from-zinc-600 to-zinc-800 text-white shadow-md hover:from-zinc-700 hover:to-zinc-900"
        disabled={busy}
      >
        {busy ? "Signing in…" : (
          <>
            Continue <ChevronRight className="size-3.5" />
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 grid lg:grid-cols-2 min-h-screen">
      <section className="hidden lg:flex flex-col bg-[#1B3566] px-10 py-10 text-white">
        <Image src="/tcg-logo.png" alt="TCG — Trace Consulting Group Ltd." width={140} height={56} className="object-contain brightness-0 invert" priority />

        <div className="my-auto max-w-2xl">
          <p className="font-serif text-sm font-semibold uppercase tracking-[0.15em] text-sky-300">Internal Tool</p>
          <h1 className="mt-4 font-serif text-5xl font-bold">Format Assist</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-sky-100">
            Upload a drafted report and get it back formatted to TCG report standards — powered by AI.
          </p>
          <ul className="mt-10 grid grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 rounded-xl bg-white/10 px-5 py-3 text-sm">
                <Icon className="size-4 text-sky-200" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-sky-400">Trace Consulting Group Ltd. · 240 Chrislea Road, Suite 105, Vaughan ON</p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <div className="rounded-xl bg-[#1B3566] px-5 py-3">
              <Image src="/tcg-logo.png" alt="TCG" width={90} height={36} className="object-contain brightness-0 invert" priority />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-xl">
            <div className="px-6 py-10 sm:px-12">
              <div className="mb-8 text-center">
                <h2 className="font-serif text-xl font-bold text-slate-900">Sign in to Format Assist</h2>
                <p className="mt-2 text-sm text-slate-600">Welcome back! Please sign in to continue</p>
              </div>
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
            <div className="border-t bg-slate-50 px-6 py-4 text-center text-xs text-muted-foreground">
              Accounts are created by your administrator. First time? Use the one-time password you were given.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
