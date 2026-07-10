# Everlast

Eine NotebookLM-Alternative: Quellen hochladen (PDF, YouTube, Audio, Text,
Weblinks), mit ihnen im Chat arbeiten — inklusive klickbarer Quellenzitate —,
eigene Notizen als selektiven KI-Kontext einbinden, Studio-Artefakte
generieren (Briefing, FAQ, Mindmap, Datentabelle, Karteikarten, Quiz,
Landingpage) und daraus einen KI-Podcast erzeugen.

**Live:** https://notebook-everlast.vercel.app

## Warum dieses Projekt

Everlast ist als Testaufgabe im Rahmen einer Bewerbung entstanden. Das
Designsystem orientiert sich bewusst am visuellen Auftritt von
kiberatung.de (helle Premium-Basis, Lime als einzige Signalfarbe, große
runde Flächen) — Details dazu in
[`docs/kiberatung-design-system.md`](docs/kiberatung-design-system.md).
Die `ki-*`-Utility-Klassen im Code (`ki-card`, `ki-panel`, `ki-pill`, …)
tragen deshalb bewusst dieses Präfix.

## USP: quellentreue Antworten mit Zitaten

Der Chat beantwortet Fragen ausschließlich auf Basis der hinzugefügten
Quellen (und optional eigener Notizen) — ohne zu halluzinieren — und
synthetisiert dabei über alle Quellen hinweg statt sie einzeln
abzuklappern. Jede Aussage bleibt per klickbarem Zitat bis zur Originalstelle
in der Quelle rückverfolgbar, analog zum Kernversprechen von NotebookLM.

## Vorgehen

- Geplant mit Claude Fable5, unter anderem durch Brainstorming per
  Superpowers-Skill (strukturiertes Frage-Antwort-Vorgehen vor der
  Implementierung); Pläne und Spezifikationen liegen unter
  [`docs/superpowers/`](docs/superpowers/).
- Tech-Stack-Entscheidung: Next.js mit Tailwind CSS im Frontend, Neon
  (serverloses Postgres) als Datenbank-Backend.
- Deployment und Hosting über Vercel.
- OpenRouter als Zugangsschicht zu den LLMs für Chat, Artefakt-Generierung
  und Deep Research.
- OpenAI TTS (Modell `gpt-4o-mini-tts`) für die generierten Zwei-Stimmen-
  Podcasts (Audio Overview).
- Eingesetzte Modelle/Werkzeuge während der Entwicklung: Claude Fable5 und
  Opus 4.8 für Planung/Architektur, Claude Sonnet 5 als Ausführer für die
  Implementierung, daneben punktuell GPT-5.5, Gemini 3.5 Flash und GLM 5.2
  für kleinere Teilaufgaben.

## Features

- **Quellen-Ingestion:** PDF, YouTube (Transkript-Extraktion mit mehreren
  Fallback-Strategien), Audio (Whisper-Transkription), Weblinks
  (Readability-Extraktion) und reiner Text.
- **Chat mit Zitaten:** streamt Antworten inkl. klickbarer Quellenmarken,
  wahlweise mit eigenen Notizen als Zusatzkontext.
- **Studio-Artefakte:** Briefing, FAQ, Mindmap, Datentabelle (mit
  Excel-Export), Präsentation/Bericht (mit PDF-Export), interaktive
  Karteikarten, Quiz, Landingpage-Entwurf — jeweils wahlweise auf Basis
  aller Quellen oder einer eigenen Auswahl.
- **Deep Research:** recherchiert zusätzliche Web-Quellen zu einer Frage
  und listet sie mit Titel und Link auf.
- **Audio Overview:** generiert ein Podcast-Skript und vertont es als
  Zwei-Stimmen-Gespräch.
- **Anonyme Besucher-Sessions:** kein Login nötig; Notebooks gehören einer
  Besucher-ID mit serverseitig durchgesetzten Tageslimits.

## Tech-Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4
- **Datenbank:** Neon Postgres (`@neondatabase/serverless`, HTTP-Treiber,
  keine Transaktionen), Drizzle ORM inkl. Migrationen
- **Dateien:** Vercel Blob für Uploads
- **KI:** OpenRouter (Chat/Artefakte/Research), OpenAI (Whisper-Transkription
  und TTS), youtubei.js für YouTube-Metadaten/Transkripte
- **Sonstiges:** jsPDF und SheetJS (`xlsx`) für Exporte, `@xyflow/react` für
  die Mindmap-Darstellung
- **Tests:** Vitest (jsdom), PGlite für echte, aber offline laufende
  Datenbanktests

## Setup (lokal)

1. `npm install`
2. Neon-Postgres anlegen (https://neon.tech, Free Tier) und `DATABASE_URL`
   in `.env.local` eintragen (Vorlage: `.env.example`)
3. Migrationen einspielen: `npx drizzle-kit migrate`
4. Für Quellen-Ingestion zusätzlich in `.env.local` eintragen:
   - `ANTHROPIC_API_KEY` oder `OPENROUTER_API_KEY` (Tokenzählung; Anthropic
     exakt, OpenRouter lokal geschätzt)
   - `OPENROUTER_MODEL` (optional; Standard: `deepseek/deepseek-v4-flash`,
     auch für den Chat)
   - `OPENAI_API_KEY` (OpenAI — Audio-Transkription und bevorzugtes TTS)
   - `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE_A`, `OPENAI_TTS_VOICE_B` (optional;
     Standard: `gpt-4o-mini-tts`, `alloy`, `onyx`)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Blob — im Vercel-Dashboard einen
     Blob-Store anlegen und den Token kopieren)
   - `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_A`, `ELEVENLABS_VOICE_B`
     (optional — Fallback für Audio Overview, falls OpenAI-TTS nicht gesetzt
     ist)
   - `TRANSCRIPT_API_KEY` (optional — primäre YouTube-Transkript-Quelle über
     [transcriptapi.com](https://transcriptapi.com/docs/api/); ohne Key greift
     automatisch die kostenlose Innertube-Fallback-Kette)
5. `npm run dev` → http://localhost:3000

Demo-Notebook seedbar machen:

```bash
npm run db:seed:demo
```

## Tests

`npm test` — läuft komplett offline (PGlite statt Neon, keine echten
API-Aufrufe; alle externen SDKs sind gemockt).

Gezielter Kernworkflow-Smoke:

```bash
npm run smoke
```

## Deployment (Vercel)

1. Neon-Datenbank in Vercel als `DATABASE_URL` setzen.
2. `OPENROUTER_API_KEY` setzen; optional `OPENROUTER_MODEL` überschreiben.
3. Für Uploads `BLOB_READ_WRITE_TOKEN` aus dem Vercel-Blob-Store setzen.
4. Für Audio-Transkription und Audio-Overviews `OPENAI_API_KEY` setzen.
5. Optional zusätzlich `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_A`,
   `ELEVENLABS_VOICE_B` als Fallback konfigurieren.
6. Für zuverlässige YouTube-Transkripte `TRANSCRIPT_API_KEY` setzen (siehe
   Abschnitt „Bekannte Einschränkung" unten).
7. Vor Deployment lokal prüfen:

```bash
npm test
npm run smoke
npx tsc --noEmit
npm run lint
npm run build
```

8. Nach Migrationen oder Demo-Reset einmal ausführen:

```bash
npx drizzle-kit migrate
npm run db:seed:demo
```

## YouTube-Transkripte in Produktion

Auf Vercel (Cloud-IP-Bereich) blockiert YouTube die kostenlosen
Innertube-Transkript-Endpunkte teilweise als Anti-Bot-Maßnahme. Primäre
Transkript-Quelle ist deshalb [transcriptapi.com](https://transcriptapi.com/docs/api/)
(`TRANSCRIPT_API_KEY`). Ist kein Key gesetzt, greift automatisch eine
dreistufige kostenlose Fallback-Kette (Innertube-Panel/Caption-Tracks,
Watch-Page-HTML-Scraping, Innertube-ANDROID-Client), die lokal funktioniert,
auf Vercels IP-Range aber je nach Video scheitern kann. Als letzter
Workaround lässt sich die Audiospur eines Videos manuell hochladen und per
Whisper transkribieren.

## Dokumente

- Design-Spec: `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md`
- Kiberatung-Designsystem-Referenz: `docs/kiberatung-design-system.md`
- Pläne: `docs/superpowers/plans/`
