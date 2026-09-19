"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";

interface Group {
  id: string;
  name: string;
  description?: string | null;
  documents: Array<{ role: string; document: { id: string; filename: string; status: string } }>;
}

export default function GroupsPage() {
  const { push } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [docs, setDocs] = useState<Array<{ id: string; filename: string }>>([]);

  async function load() {
    const [g, d] = await Promise.all([
      api<{ items: Group[] }>("/api/v1/document-groups"),
      api<{ items: Array<{ id: string; filename: string }> }>("/api/v1/documents?limit=100"),
    ]);
    setGroups(g.items);
    setDocs(d.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/v1/document-groups", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), description: form.get("description") }),
    });
    push("Group created", "success");
    (event.target as HTMLFormElement).reset();
    await load();
  }

  async function addDoc(groupId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/v1/document-groups/${groupId}/documents`, {
      method: "POST",
      body: JSON.stringify({ documentId: form.get("documentId"), role: form.get("role") }),
    });
    push("Document linked", "success");
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Document groups</h1>
        <p className="mt-2 text-ink-500">Keep a question paper, answer key, and solutions together as one exam set.</p>
      </header>
      <Card>
        <form onSubmit={createGroup} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input required name="name" placeholder="Exam Set A" className="rounded-md border border-paper-200 px-3 py-2 text-sm" />
          <input name="description" placeholder="Description" className="rounded-md border border-paper-200 px-3 py-2 text-sm" />
          <button className="rounded-md bg-pine-700 px-4 py-2 text-sm text-white">Create group</button>
        </form>
      </Card>
      {groups.length === 0 ? (
        <EmptyState title="No groups yet" body="Create a set, then attach the paper and its answer key." />
      ) : (
        groups.map((group) => (
          <Card key={group.id}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl">{group.name}</h2>
                <p className="text-sm text-ink-500">{group.description}</p>
              </div>
              <Link className="text-sm underline" href={`/groups/${group.id}`}>
                Open
              </Link>
            </div>
            <ul className="mt-4 space-y-2">
              {group.documents.map((member) => (
                <li key={member.document.id} className="flex items-center justify-between text-sm">
                  <Link href={`/documents/${member.document.id}`} className="hover:underline">
                    {member.document.filename}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-500">{member.role.replaceAll("_", " ")}</span>
                    <StatusBadge status={member.document.status} />
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => addDoc(group.id, e)} className="mt-4 flex flex-wrap gap-2">
              <select name="documentId" className="rounded-md border border-paper-200 px-2 py-1.5 text-sm">
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename}
                  </option>
                ))}
              </select>
              <select name="role" className="rounded-md border border-paper-200 px-2 py-1.5 text-sm">
                <option value="QUESTION_PAPER">Question paper</option>
                <option value="ANSWER_KEY">Answer key</option>
                <option value="SOLUTIONS">Solutions</option>
                <option value="SUPPORTING">Supporting</option>
              </select>
              <button className="rounded-md border border-paper-200 px-3 py-1.5 text-sm">Add</button>
            </form>
          </Card>
        ))
      )}
    </div>
  );
}
