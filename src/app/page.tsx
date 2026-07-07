import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { listVisibleNotebooks } from "@/db/repo/notebooks";
import { NotebookList } from "@/components/dashboard/NotebookList";

export const dynamic = "force-dynamic";

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-baseline justify-between border-b-2 border-ink pb-4">
        <span className="text-xl font-bold tracking-widest">EVERLAST</span>
        <span className="label-caps text-ink/60">
          Quellen · Chat · Studio
        </span>
      </header>
      {children}
    </main>
  );
}

function MissingDatabaseSetup() {
  return (
    <DashboardShell>
      <section className="border-[1.5px] border-ink bg-paper p-6">
        <p className="label-caps mb-4 text-ink/60">Setup fehlt</p>
        <h1 className="mb-3 text-xl font-semibold">
          Datenbank-Verbindung eintragen
        </h1>
        <p className="mb-4 max-w-2xl text-sm leading-6 text-ink/80">
          Everlast braucht lokal eine Neon-Postgres-Verbindung. Leg eine
          <code className="mx-1 border border-ink px-1">.env.local</code>
          nach Vorlage
          <code className="mx-1 border border-ink px-1">.env.example</code>
          an und starte den Dev-Server danach neu.
        </p>
        <pre className="overflow-x-auto border-[1.5px] border-ink bg-ground p-3 text-xs">
{`DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash
BLOB_READ_WRITE_TOKEN=...
OPENAI_API_KEY=...`}
        </pre>
      </section>
    </DashboardShell>
  );
}

export default async function DashboardPage() {
  if (!process.env.DATABASE_URL) {
    return <MissingDatabaseSetup />;
  }

  const visitorId = readVisitorId(await cookies());
  const notebooks = visitorId
    ? await listVisibleNotebooks(getDb(), visitorId)
    : [];

  return (
    <DashboardShell>
      <NotebookList
        notebooks={notebooks.map((nb) => ({
          id: nb.id,
          title: nb.title,
          isDemo: nb.isDemo,
          createdAt: nb.createdAt.toISOString(),
        }))}
      />
    </DashboardShell>
  );
}
