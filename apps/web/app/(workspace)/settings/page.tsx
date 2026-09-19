"use client";

import { Card } from "@/components/ui";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="mt-2 text-ink-500">Workspace identity, API access, and extraction providers.</p>
      </header>
      <Card>
        <h2 className="font-display text-2xl">Account</h2>
        <p className="mt-3 text-sm">{user?.name}</p>
        <p className="text-sm text-ink-500">{user?.email}</p>
      </Card>
      <Card>
        <h2 className="font-display text-2xl">API & documentation</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            Swagger UI:{" "}
            <a className="text-pine-700 underline" href={`${apiUrl}/docs`} target="_blank" rel="noreferrer">
              {apiUrl}/docs
            </a>
          </li>
          <li>
            OpenAPI JSON:{" "}
            <a className="text-pine-700 underline" href={`${apiUrl}/docs/json`} target="_blank" rel="noreferrer">
              {apiUrl}/docs/json
            </a>
          </li>
          <li>Postman collection: <code>postman/folio.postman_collection.json</code></li>
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-2xl">Extraction providers</h2>
        <p className="mt-3 text-sm text-ink-700">
          Default local configuration uses native PDF text, Tesseract OCR, and the <strong>heuristic</strong> extraction engine.
          Heuristic is rule-based — it is not an LLM. Set <code>AI_PROVIDER=openai</code> only when an API key is available.
        </p>
      </Card>
    </div>
  );
}
