import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const DEMO_VISITOR_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_NOTEBOOK_ID = "00000000-0000-4000-8000-000000000010";

const SOURCES = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    type: "text",
    title: "Everlast Produktnotiz",
    content:
      "Everlast ist eine NotebookLM-Alternative im Dossier-Stil. Besucher legen ohne Account Dossiers an, fügen Quellen hinzu und arbeiten anschließend per Chat, Studio-Artefakten und Audio Overview mit den Inhalten. Das Design nutzt harte Linien, helle Papierflächen und eine gelbe Signalfarbe nur für primäre Aktionen und aktive Zustände.",
    tokenCount: 52,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    type: "text",
    title: "Quellenarbeit im Portfolio",
    content:
      "Das Portfolio-Produkt demonstriert Quellen-Ingestion, Chat über Dossier-Inhalte, persistente Lernartefakte und ein vorbereitetes Podcast-Skript. Für den öffentlichen Betrieb begrenzen Tageslimits die Nutzung teurer KI-Routen. Demo-Dossiers sind für alle Besucher lesbar, aber gegen Änderungen geschützt.",
    tokenCount: 43,
  },
];

const ARTIFACTS = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    type: "briefing",
    content: {
      summary:
        "Everlast zeigt eine komplette Quellen-Workflow-Demo: Quellen sammeln, Fragen stellen, Artefakte erzeugen und Audio vorbereiten.",
      key_points: [
        "Dossiers gehören anonymen Besucher-Sessions.",
        "Demo-Dossiers sind schreibgeschützt.",
        "Tageslimits schützen teure KI-Routen.",
      ],
      quotes: [
        "Das Design nutzt harte Linien, helle Papierflächen und eine gelbe Signalfarbe.",
      ],
      open_questions: [
        "Welche echte TTS-Stimme soll später für Audio Overviews genutzt werden?",
      ],
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    type: "mindmap",
    content: {
      label: "Everlast",
      children: [
        {
          label: "Quellen",
          children: [{ label: "Text, URL, PDF, YouTube, Audio", children: [] }],
        },
        {
          label: "Studio",
          children: [{ label: "Briefing, FAQ, Mind Map, Audio", children: [] }],
        },
      ],
    },
  },
];

const AUDIO_SCRIPT = [
  {
    speaker: "A",
    text: "Was zeigt dieses Demo-Dossier auf den ersten Blick?",
  },
  {
    speaker: "B",
    text: "Es zeigt den Kern von Everlast: Quellen sammeln, in einem Dossier organisieren und daraus Chat-Antworten, Artefakte und ein Audio-Skript ableiten.",
  },
  {
    speaker: "A",
    text: "Warum ist das Demo-Dossier schreibgeschützt?",
  },
  {
    speaker: "B",
    text: "Damit jeder Besucher denselben stabilen ersten Eindruck bekommt, ohne dass fremde Änderungen die Demo beschädigen.",
  },
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  insert into visitor (id)
  values (${DEMO_VISITOR_ID})
  on conflict (id) do nothing
`;

await sql`
  insert into notebook (id, visitor_id, title, is_demo)
  values (${DEMO_NOTEBOOK_ID}, ${DEMO_VISITOR_ID}, 'Everlast Demo', true)
  on conflict (id) do update set
    title = excluded.title,
    is_demo = true
`;

for (const source of SOURCES) {
  await sql`
    insert into source (
      id, notebook_id, type, status, title, content, token_count
    )
    values (
      ${source.id},
      ${DEMO_NOTEBOOK_ID},
      ${source.type},
      'ready',
      ${source.title},
      ${source.content},
      ${source.tokenCount}
    )
    on conflict (id) do update set
      status = 'ready',
      title = excluded.title,
      content = excluded.content,
      token_count = excluded.token_count
  `;
}

for (const artifact of ARTIFACTS) {
  await sql`
    insert into artifact (id, notebook_id, type, status, content)
    values (
      ${artifact.id},
      ${DEMO_NOTEBOOK_ID},
      ${artifact.type},
      'ready',
      ${JSON.stringify(artifact.content)}::jsonb
    )
    on conflict (id) do update set
      status = 'ready',
      content = excluded.content
  `;
}

await sql`
  insert into audio_overview (id, notebook_id, status, script, duration_s)
  values (
    '00000000-0000-4000-8000-000000000301',
    ${DEMO_NOTEBOOK_ID},
    'script',
    ${JSON.stringify(AUDIO_SCRIPT)}::jsonb,
    48
  )
  on conflict (id) do update set
    status = 'script',
    script = excluded.script,
    duration_s = excluded.duration_s
`;

console.log("Demo-Dossier wurde angelegt oder aktualisiert.");
