# Everlast — Hinweise für Agenten

NotebookLM-Alternative, öffentliches Portfolio-Produkt. Phase-1-Fundament steht.

## Konventionen
- UI-Texte: Deutsch. Commits: Deutsch, conventional-commit-Präfix (feat/fix/chore/docs).
- Design „Dossier": Tokens `bg-paper`/`bg-ground`/`text-ink`/`bg-signal`, Klasse `.label-caps`.
  Signalfarbe (#ffd23f) NUR für primäre Aktionen, Zitat-Chips, aktive Zustände — nie für Fehler/Status.
  Keine Rundungen, keine Schatten, harte 1,5–2px-Linien (`border-[1.5px] border-ink`).
- Datenzugriff: Repositories nehmen `db: Db` als ersten Parameter (Injection).
  Prod: `getDb()` (Neon-HTTP — KEINE Transaktionen!). Tests: `createTestDb()` (PGlite + echte Migrationen).
- Autorisierung im Repo-Layer: Queries immer mit `visitorId` absichern (Vorbild: `getNotebook`).
- Quellen-Ingestion: alle externen SDKs (`unpdf`, `@mozilla/readability`, `linkedom`,
  `youtubei.js`, `openai`, `@anthropic-ai/sdk`, `@vercel/blob/client`) werden in Tests
  immer mit `vi.mock` ersetzt — nie echte Netzwerk-/API-Aufrufe. Extraktions-Module
  werfen ausschließlich `IngestionError` (`src/lib/ingestion/errors.ts`) mit einer
  fertigen deutschen Meldung; der Orchestrator (`processSource`) normalisiert alle
  anderen Fehler zu einer generischen Meldung und wirft selbst niemals nach außen.
- Tests: `npm test` (Vitest, sequenziell, offline). Vor Commits: `npm test && npx tsc --noEmit && npm run lint`.

## Dokumente
- Design-Spec: docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md
- Pläne: docs/superpowers/plans/

## Next.js-Doku
Next.js-Dokumentation liegt unter node_modules/next/dist/docs/ (bei Framework-Fragen zuerst dort nachsehen).
