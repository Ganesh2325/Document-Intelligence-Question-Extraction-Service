"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await register(String(form.get("name")), String(form.get("email")), String(form.get("password")));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to register.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-card">
        <h1 className="font-display text-3xl">Create account</h1>
        <label className="mt-6 block text-sm">
          Name
          <input required name="name" className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2" />
        </label>
        <label className="mt-4 block text-sm">
          Email
          <input required name="email" type="email" className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2" />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input required name="password" type="password" minLength={8} className="mt-1 w-full rounded-md border border-paper-200 px-3 py-2" />
        </label>
        {error ? <p className="mt-4 text-sm text-rust-600">{error}</p> : null}
        <button disabled={pending} className="mt-6 w-full rounded-md bg-pine-700 px-4 py-2.5 text-sm text-white disabled:opacity-60">
          {pending ? "Creating…" : "Create account"}
        </button>
        <p className="mt-4 text-sm text-ink-500">
          Already registered?{" "}
          <Link href="/login" className="text-pine-700 underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
