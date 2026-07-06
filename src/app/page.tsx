import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { listNotebooks } from "@/db/repo/notebooks";
import { NotebookList } from "@/components/dashboard/NotebookList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const visitorId = readVisitorId(await cookies());
  const notebooks = visitorId
    ? await listNotebooks(getDb(), visitorId)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-baseline justify-between border-b-2 border-ink pb-4">
        <span className="text-xl font-bold tracking-widest">EVERLAST</span>
        <span className="label-caps text-ink/60">
          Quellen · Chat · Studio
        </span>
      </header>
      <NotebookList
        notebooks={notebooks.map((nb) => ({
          id: nb.id,
          title: nb.title,
          createdAt: nb.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
