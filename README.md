# Everlast

NotebookLM-Alternative im Dossier-Design: Quellen hochladen, mit ihnen
chatten (mit klickbaren Zitaten), Artefakte generieren, KI-Podcast erzeugen.

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
   - `OPENAI_API_KEY` (OpenAI — nur für Audio-Transkription)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Blob — im Vercel-Dashboard einen Blob-Store
     anlegen und den Token kopieren)
   - `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_A`, `ELEVENLABS_VOICE_B`
     (optional — echte MP3-Erzeugung für Audio Overview; ohne diese Werte bleibt
     das Podcast-Skript verfügbar)
5. `npm run dev` → http://localhost:3000

Demo-Dossier seedbar machen:

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
4. Für Audio-Transkription `OPENAI_API_KEY` setzen.
5. Für echte MP3-Audio-Overviews optional `ELEVENLABS_API_KEY`,
   `ELEVENLABS_VOICE_A`, `ELEVENLABS_VOICE_B` setzen.
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
