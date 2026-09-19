"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/processing", label: "Processing" },
  { href: "/questions", label: "Questions" },
  { href: "/review", label: "Review" },
  { href: "/groups", label: "Document Groups" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100" aria-busy="true">
        <div className="w-full max-w-sm space-y-3 px-6">
          <div className="skeleton h-8 w-40 rounded" />
          <div className="skeleton h-24 w-full rounded-xl" />
          <p className="text-center text-sm text-ink-500">Restoring workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-100 text-ink-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-950 text-paper-50 md:flex">
          <div className="px-6 pb-2 pt-8">
            <p className="font-display text-2xl tracking-tight">Folio</p>
            <p className="mt-1 text-xs text-ink-300">Document intelligence</p>
          </div>
          <nav className="mt-6 flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm transition ${
                    active ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 p-4 text-center">
            <LogoutButton onClick={logout} />
            <p className="mt-3 truncate text-sm">{user.name}</p>
            <p className="truncate text-xs text-ink-300">{user.email}</p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-paper-200 bg-paper-50/80 px-4 py-3 backdrop-blur md:hidden">
            <p className="font-display text-lg">Folio</p>
            <select
              aria-label="Navigate"
              className="min-w-0 flex-1 rounded border border-paper-200 bg-white px-2 py-1 text-sm"
              value={NAV.find((n) => pathname.startsWith(n.href))?.href ?? "/dashboard"}
              onChange={(e) => router.push(e.target.value)}
            >
              {NAV.map((item) => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </select>
            <LogoutButton onClick={logout} compact />
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function LogoutButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`logout-btn inline-flex items-center justify-center gap-2 rounded-full bg-rust-600 font-medium text-white ${
        compact ? "h-9 px-3 text-xs" : "mx-auto h-10 w-[11rem] px-4 text-sm"
      }`}
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path
          d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M8 10h8m0 0-2.4-2.4M16 10l-2.4 2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Logout
    </button>
  );
}
