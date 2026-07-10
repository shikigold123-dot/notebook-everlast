import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { listVisibleNotebooks } from "@/db/repo/notebooks";
import { NotebookList } from "@/components/dashboard/NotebookList";
import { Icon, type IconName } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const CAPABILITIES: { icon: IconName; label: string; description: string }[] = [
  { icon: "file", label: "Quellen", description: "PDF · Web · YouTube · Audio" },
  { icon: "chat", label: "Chat", description: "Antworten mit Zitaten" },
  { icon: "studio", label: "Studio", description: "Berichte · Podcast · Quiz" },
  { icon: "research", label: "Deep Research", description: "Web-Recherche als Quelle" },
];

const SKILLS = [
  "AI-Development",
  "Automation (n8n)",
  "SEO/GEO/SEA",
  "Webdesign",
  "WordPress",
  "AI Agents",
];

const JOBS = [
  {
    period: "2023–Heute",
    role: "KI-Developer & Automatisierungs-Spezialist",
    company: "SPACEGOATS GmbH & Freelancing",
    description:
      "Konzeption und Implementierung fortschrittlicher KI-Lösungen und autonomer Agenten-Systeme für Kunden und eigene Ventures. Als Leistungsträger entwickle ich komplexe n8n-Workflows und integriere modernste LLM-APIs, um echten geschäftlichen Impact (Effizienz- und Zeitgewinn) zu erzielen. Ich verbinde tiefes SEO- und GEO-Verständnis mit pragmatischer KI-Automatisierung für messbares Wachstum in Performance-Teams.",
  },
  {
    period: "2023–2024",
    role: "SEO Spezialist (InHouse)",
    company: "CamperOase",
    description:
      "Verantwortlich für die Inhouse-SEO-Strategie eines E-Commerce-Unternehmens, mit Fokus auf technischer SEO und Performance-Steigerung.",
  },
  {
    period: "2022–2023",
    role: "SEO & Digital Performance Consultant",
    company: "Suchhelden GmbH",
    description:
      "Erste angestellte Berufserfahrung im Agenturumfeld. Konzeption, Durchführung und Umsetzung datengetriebener SEO-Strategien für eine Vielzahl an Kunden aus unterschiedlichen Branchen, stets mit Fokus auf messbaren Ergebnissen und ROI.",
  },
  {
    period: "2017–2021",
    role: "Founder / Web & SEO Consultant",
    company: "MG Media",
    description:
      "Unternehmerischer Aufbau und Betrieb mehrerer erfolgreicher Nischen-Webseiten. Verantwortung für das technische Setup, die Automatisierung von Prozessen und WordPress-Webdesign, was zur Dominanz der Google SERPs führte.",
  },
];

const EDUCATION = [
  {
    period: "2023",
    role: "Bachelor Wirtschaftsinformatik",
    company: "FOM Essen",
    description:
      "Studium der Wirtschaftsinformatik, welches die Schnittstelle zwischen betriebswirtschaftlichen Prozessen und modernen IT-Lösungen vertieft.",
  },
  {
    period: "2017",
    role: "Fachhochschulreife",
    company: "Gesamtschule",
    description:
      "Abschluss der Fachhochschulreife, wodurch die formale Qualifikation für ein Studium an einer Fachhochschule erworben wurde.",
  },
];

function TimelineEntry({
  period,
  role,
  company,
  description,
}: (typeof JOBS)[number]) {
  return (
    <div className="relative border-l border-line pl-5">
      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-signal" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold">{role}</h4>
        <span className="label-caps text-muted">{period}</span>
      </div>
      <p className="label-caps mt-1 text-muted">{company}</p>
      <p className="mt-2 text-xs leading-5 text-ink/80">{description}</p>
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="ki-shell min-h-dvh px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="ki-card mb-8 overflow-hidden">
          <div className="flex flex-col gap-7 border-b border-line/50 bg-panel/80 px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-[0.75rem] bg-signal text-signal-ink shadow-glow">
                  <Icon name="spark" size={18} />
                </span>
                <span className="text-lg font-bold tracking-wider">
                  EVERLAST
                </span>
              </span>
              <span className="label-caps ki-pill inline-flex px-3 py-1.5 text-muted">
                KI-Workspace
              </span>
            </div>
            <div>
              <h1 className="max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
                NotebookLM-Alternative{" "}
                <span className="text-muted">by Matin</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
                Quellen sammeln, mit belegten Antworten chatten und daraus
                Berichte, Podcasts oder Lernmaterial generieren.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 bg-paper/60 sm:grid-cols-4">
            {CAPABILITIES.map((item, index) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 px-5 py-4 ${
                  index < CAPABILITIES.length - 1
                    ? "border-b border-line/50 sm:border-b-0 sm:border-r"
                    : ""
                } ${index === 0 ? "border-r border-line/50 sm:border-r" : ""}`}
              >
                <span className="ki-tile h-9 w-9 shrink-0">
                  <Icon name={item.icon} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="label-caps block text-ink">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {item.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </header>
        {children}
        <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          {/* Linke Spalte: Über mich, Skills & Kontakt */}
          <div className="ki-card flex flex-col justify-between p-6 sm:p-7">
            <div>
              <span className="label-caps ki-pill inline-flex px-3 py-1 text-muted">
                Über mich
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                Matin Anwar
              </h2>
              <p className="label-caps mt-2 text-muted">
                KI-Developer & Automatisierungs-Spezialist
              </p>

              <p className="mt-5 text-sm leading-6 text-ink/80">
                Hallo! Ich bin Matin Anwar, leidenschaftlicher Entwickler im
                Bereich Künstliche Intelligenz (KI), Automatisierung und Digital
                Performance. Mit einer klaren A-Player-Mentalität strebe ich
                danach, die KI-Revolution aktiv mitzugestalten und echten
                geschäftlichen Impact zu schaffen. Mein Fokus liegt auf dem
                Aufbau intelligenter Systeme und autonomer Agenten, die komplexe
                Prozesse skalierbar automatisieren. Dazu bringe ich Erfahrung
                aus zahlreichen erfolgreichen Kundenprojekten und eigenen
                Ventures mit.
              </p>

              <div className="mt-7">
                <p className="label-caps mb-3 text-muted">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {SKILLS.map((skill) => (
                    <span
                      key={skill}
                      className="label-caps ki-pill px-3 py-1.5 text-ink/80"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-line/50 pt-6">
              <p className="label-caps mb-3 text-muted">Kontakt</p>
              <div className="space-y-1.5 text-sm">
                <p>
                  <span className="font-semibold">Telefon:</span>{" "}
                  <a
                    href="tel:+4917621403459"
                    className="font-mono text-ink/80 underline-offset-4 hover:underline"
                  >
                    +49 176 21403459
                  </a>
                </p>
                <p>
                  <span className="font-semibold">E-Mail:</span>{" "}
                  <a
                    href="mailto:matin.anwar97@gmail.com"
                    className="font-mono text-ink/80 underline-offset-4 hover:underline"
                  >
                    matin.anwar97@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Rechte Spalte: Arbeit und Ausbildung */}
          <div className="ki-card flex flex-col overflow-hidden">
            <div className="border-b border-line/50 bg-panel/80 px-6 py-4 sm:px-7">
              <p className="label-caps ki-pill inline-flex px-3 py-1 text-muted">
                Lebenslauf
              </p>
            </div>

            <div className="space-y-10 p-6 sm:p-7">
              <div>
                <h3 className="label-caps mb-5 border-b border-line/50 pb-2 text-muted">
                  Arbeit
                </h3>
                <div className="space-y-7">
                  {JOBS.map((job) => (
                    <TimelineEntry key={job.role} {...job} />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="label-caps mb-5 border-b border-line/50 pb-2 text-muted">
                  Schule & Studium
                </h3>
                <div className="space-y-7">
                  {EDUCATION.map((edu) => (
                    <TimelineEntry key={edu.role} {...edu} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MissingDatabaseSetup() {
  return (
    <DashboardShell>
      <section className="ki-card p-6 sm:p-7">
        <p className="label-caps mb-4 text-muted">Setup fehlt</p>
        <h2 className="mb-3 text-xl font-semibold">
          Datenbank-Verbindung eintragen
        </h2>
        <p className="mb-4 max-w-2xl text-sm leading-6 text-ink/80">
          Everlast braucht lokal eine Neon-Postgres-Verbindung. Leg eine
          <code className="mx-1 rounded-sm border border-line bg-panel-soft px-1.5 py-0.5 font-mono text-xs">
            .env.local
          </code>
          nach Vorlage
          <code className="mx-1 rounded-sm border border-line bg-panel-soft px-1.5 py-0.5 font-mono text-xs">
            .env.example
          </code>
          an und starte den Dev-Server danach neu.
        </p>
        <pre className="ki-soft overflow-x-auto p-4 text-xs leading-6">
{`DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash
BLOB_READ_WRITE_TOKEN=...
OPENAI_API_KEY=...
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE_A=alloy
OPENAI_TTS_VOICE_B=onyx`}
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
