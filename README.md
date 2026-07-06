# Everlast

NotebookLM-Alternative im Dossier-Design: Quellen hochladen, mit ihnen
chatten (mit klickbaren Zitaten), Artefakte generieren, KI-Podcast erzeugen.

## Setup (lokal)

1. `npm install`
2. Neon-Postgres anlegen (https://neon.tech, Free Tier) und `DATABASE_URL`
   in `.env.local` eintragen (Vorlage: `.env.example`)
3. Migrationen einspielen: `npx drizzle-kit migrate`
4. `npm run dev` → http://localhost:3000

## Tests

`npm test` — läuft komplett offline (PGlite statt Neon, keine API-Aufrufe).

## Dokumente

- Design-Spec: `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md`
- Pläne: `docs/superpowers/plans/`
