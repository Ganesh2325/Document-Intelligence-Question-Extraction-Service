"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, StatusBadge } from "@/components/ui";
import Link from "next/link";

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const [group, setGroup] = useState<{
    id: string;
    name: string;
    description?: string | null;
    documents: Array<{ role: string; document: { id: string; filename: string; status: string } }>;
  } | null>(null);

  useEffect(() => {
    api<{ group: NonNullable<typeof group> }>(`/api/v1/document-groups/${params.id}`).then((res) => setGroup(res.group));
  }, [params.id]);

  if (!group) return <p>Loading group…</p>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-500">Exam set</p>
        <h1 className="font-display text-4xl">{group.name}</h1>
        <p className="mt-2 text-ink-500">{group.description}</p>
      </header>
      <Card>
        <ul className="space-y-3">
          {group.documents.map((member) => (
            <li key={member.document.id} className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-500">{member.role.replaceAll("_", " ")}</p>
                <Link href={`/documents/${member.document.id}`} className="font-medium hover:underline">
                  {member.document.filename}
                </Link>
              </div>
              <StatusBadge status={member.document.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
