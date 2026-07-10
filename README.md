# Everlast

NotebookLM-Alternative im Notebook-Design: Quellen hochladen, mit ihnen
chatten (mit klickbaren Zitaten), eigene Notizen als selektiven KI-Kontext
verwenden, Artefakte generieren und KI-Podcasts erzeugen.

## Setup (lokal)

1. `npm install`
2. Neon-Postgres anlegen (https://neon.tech, Free Tier) und `DATABASE_URL`
   in `.env.local` eintragen (Vorlage: `.env.example`)
3. Migrationen einspielen: `npx drizzle-kit migrate`
4. Für Quellen-Ingestion zusätzlich in `.env.local` eintragen:
   - `ANTHROPIC_API_KEY` oder `OPENROUTER_API_KEY` (Tokenzählung; Anthropic exakt,
     OpenRouter lokal geschätzt)
   - `OPENROUTER_MODEL` (optional; Standard: `google/gemini-2.5-flash`, auch
     für den Chat)
   - `OPENAI_API_KEY` (OpenAI — Audio-Transkription und bevorzugtes TTS)
   - `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE_A`, `OPENAI_TTS_VOICE_B` (optional;
     Standard: `gpt-4o-mini-tts`, `alloy`, `onyx`)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Blob — im Vercel-Dashboard einen Blob-Store
     anlegen und den Token kopieren)
   - `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_A`, `ELEVENLABS_VOICE_B`
     (optional — Fallback für Audio Overview, falls OpenAI-TTS nicht gesetzt ist)
5. `npm run dev` → http://localhost:3000

Demo-Notebook seedbar machen:

```bash
npm run db:seed:demo
```

## Tests

`npm test` — läuft komplett offline (PGlite statt Neon, keine API-Aufrufe).

Gezielter Kernworkflow-Smoke:

```bash
npm run smoke
```

## Deployment (Vercel)

1. Neon-Datenbank in Vercel als `DATABASE_URL` setzen.
2. `OPENROUTER_API_KEY` setzen; optional `OPENROUTER_MODEL` überschreiben.
3. Für Uploads `BLOB_READ_WRITE_TOKEN` aus dem Vercel-Blob-Store setzen.
4. Für Audio-Transkription und Audio-Overviews `OPENAI_API_KEY` setzen.
5. Optional zusätzlich
   `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_A`, `ELEVENLABS_VOICE_B` als
   Fallback konfigurieren.
6. Vor Deployment lokal prüfen:

```bash
npm test
npm run smoke
npx tsc --noEmit
npm run lint
npm run build
```

7. Nach Migrationen oder Demo-Reset einmal ausführen:

```bash
npx drizzle-kit migrate
npm run db:seed:demo
```

## Dokumente

- Design-Spec: `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md`
- Pläne: `docs/superpowers/plans/`
- Open-Notebook-Vergleich: `docs/open-notebook-gap-roadmap.md`
