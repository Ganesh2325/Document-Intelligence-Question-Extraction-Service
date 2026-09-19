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
      <div className="flex min-h-screen items-center justify-center bg-paper-100 text-ink-500">
        Loading workspace…
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
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-sm">{user.name}</p>
            <p className="truncate text-xs text-ink-300">{user.email}</p>
            <button type="button" onClick={logout} className="mt-3 text-xs text-ink-300 underline-offset-2 hover:text-white hover:underline">
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-paper-200 bg-paper-50/80 px-4 py-3 backdrop-blur md:hidden">
            <p className="font-display text-lg">Folio</p>
            <select
              aria-label="Navigate"
              className="rounded border border-paper-200 bg-white px-2 py-1 text-sm"
              value={NAV.find((n) => pathname.startsWith(n.href))?.href ?? "/dashboard"}
              onChange={(e) => router.push(e.target.value)}
            >
              {NAV.map((item) => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </select>
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
