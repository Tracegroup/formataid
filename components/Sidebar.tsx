"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FileUp, History, KeyRound, LogOut, Menu, Settings2, Users, X } from "lucide-react";
import type { Role } from "@/lib/session";
import { api } from "@/lib/client";

const ROLE_LABELS: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", user: "User" };

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { label: "Format Report", href: "/", icon: FileUp },
  { label: "History", href: "/history", icon: History },
  { label: "Users", href: "/admin/users", icon: Users, roles: ["super_admin"] },
  { label: "AI & Usage", href: "/admin/settings", icon: Settings2, roles: ["super_admin", "admin"] },
];

export default function Sidebar({ user }: { user: { name: string; email: string; role: Role } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full reload to drop all client state after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  const content = (
    <>
      <div className="px-4 pt-5 pb-4 border-b border-white/10">
        <Image src="/tcg-logo.png" alt="TCG" width={80} height={32} className="object-contain brightness-0 invert" priority />
        <p className="text-[9px] font-semibold text-blue-300/80 uppercase tracking-widest mt-1.5">Format Assist</p>
      </div>
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {items.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active ? "bg-white/15 text-white" : "text-blue-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs font-medium text-white truncate">{user.name}</p>
        <p className="text-[10px] text-blue-200/70 truncate">{user.email}</p>
        <p className="text-[10px] text-blue-300/80 mt-0.5">{ROLE_LABELS[user.role]}</p>
        <div className="mt-3 flex flex-col gap-1.5">
          <Link href="/change-password" className="flex items-center gap-1.5 text-[11px] text-blue-200/80 hover:text-white">
            <KeyRound className="size-3" /> Change password
          </Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-[11px] text-blue-200/80 hover:text-white">
            <LogOut className="size-3" /> Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-[#1B3566] px-4 py-3">
        <span className="text-sm font-semibold text-white">Format Assist</span>
        <button onClick={() => setOpen(true)} className="text-white" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-56 h-full flex flex-col bg-[#1B3566]">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 text-white" aria-label="Close menu">
              <X className="size-4" />
            </button>
            {content}
          </aside>
        </div>
      )}
      <aside className="hidden md:flex w-48 shrink-0 h-screen sticky top-0 flex-col bg-[#1B3566]">{content}</aside>
    </>
  );
}
