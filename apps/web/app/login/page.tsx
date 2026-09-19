"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

const DEMO_NAME = "Recruiter";
const DEMO_EMAIL = "recruiter@folio.dev";
const DEMO_PASSWORD = "RecruiterDemo123!";

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enter(email: string, password: string) {
    try {
      await login(email, password);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      await register(DEMO_NAME, email, password);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await enter(String(form.get("email")), String(form.get("password")));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-ink-950 p-8 text-paper-50 sm:p-12">
        <p className="font-display text-3xl">Folio</p>
        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">From messy exam papers to trustworthy question data.</h1>
          <p className="mt-6 max-w-md text-ink-300">
            Upload → process → understand → validate → review → export. Folio never invents an answer it cannot support.
          </p>
          <div className="mt-8 max-w-md rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-300">Recruiter login</p>
            <p className="mt-3">
              <span className="text-ink-300">Email</span>
              <br />
              <span className="font-medium text-white">{DEMO_EMAIL}</span>
            </p>
            <p className="mt-3">
              <span className="text-ink-300">Password</span>
              <br />
              <span className="font-medium text-white">{DEMO_PASSWORD}</span>
            </p>
            <p className="mt-3 text-xs text-ink-300">These values are already filled on the right. Click Continue to enter. No sample documents are loaded.</p>
          </div>
        </div>
        <p className="mt-8 text-sm text-ink-300">Then upload your own PDF from Documents.</p>
      </section>
      <section className="flex items-center justify-center bg-paper-100 px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-card">
          <h2 className="font-display text-3xl">Sign in</h2>
          <p className="mt-2 text-sm text-ink-500">Recruiter credentials are pre-filled.</p>
          <label className="mt-6 block text-sm">
            Email
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={DEMO_EMAIL}
              className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2"
            />
          </label>
          <label className="mt-4 block text-sm">
            Password
            <input
              required
              name="password"
              type="password"
              minLength={8}
              autoComplete="current-password"
              defaultValue={DEMO_PASSWORD}
              className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2"
            />
          </label>
          {error ? <p className="mt-4 text-sm text-rust-600">{error}</p> : null}
          <button disabled={pending} className="mt-6 w-full rounded-md bg-pine-700 px-4 py-2.5 text-sm text-white disabled:opacity-60">
            {pending ? "Signing in…" : "Continue"}
          </button>
          <p className="mt-4 text-sm text-ink-500">
            Prefer a different account?{" "}
            <Link href="/register" className="text-pine-700 underline">
              Create an account
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
