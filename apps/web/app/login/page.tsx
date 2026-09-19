"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink-950 p-12 text-paper-50 lg:flex">
        <p className="font-display text-3xl">Folio</p>
        <div>
          <h1 className="font-display text-5xl leading-tight">From messy exam papers to trustworthy question data.</h1>
          <p className="mt-6 max-w-md text-ink-300">
            Upload → process → understand → validate → review → export. Folio never invents an answer it cannot support.
          </p>
        </div>
        <p className="text-sm text-ink-300">Demo: recruiter@folio.dev / RecruiterDemo123!</p>
      </section>
      <section className="flex items-center justify-center bg-paper-100 px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-card">
          <h2 className="font-display text-3xl">Sign in</h2>
          <p className="mt-2 text-sm text-ink-500">Use your workspace credentials.</p>
          <label className="mt-6 block text-sm">
            Email
            <input required name="email" type="email" className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2" defaultValue="recruiter@folio.dev" />
          </label>
          <label className="mt-4 block text-sm">
            Password
            <input required name="password" type="password" minLength={8} className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2" defaultValue="RecruiterDemo123!" />
          </label>
          {error ? <p className="mt-4 text-sm text-rust-600">{error}</p> : null}
          <button disabled={pending} className="mt-6 w-full rounded-md bg-pine-700 px-4 py-2.5 text-sm text-white disabled:opacity-60">
            {pending ? "Signing in…" : "Continue"}
          </button>
          <p className="mt-4 text-sm text-ink-500">
            New here?{" "}
            <Link href="/register" className="text-pine-700 underline">
              Create an account
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
