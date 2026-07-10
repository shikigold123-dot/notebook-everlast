# Everlast — Hinweise für Agenten

NotebookLM-Alternative, öffentliches Portfolio-Produkt. Phase-1-Fundament steht.

## Konventionen
- UI-Texte: Deutsch. Commits: Deutsch, conventional-commit-Präfix (feat/fix/chore/docs).
- Design „Notebook" (refined soft-rounded): Tokens `bg-paper`/`bg-ground`/`text-ink`/`bg-signal`,
  Klasse `.label-caps` (Geist Mono, 11px, 600, uppercase, 0.04em).
- Schrift: Geist Sans (body) + Geist Mono (Label-Caps, Code) via `geist` npm-Paket
  (lokal gebundelt, kein Netz-Fetch beim Build — NICHT `next/font/google`).
  Variablen: `--font-geist-sans`, `--font-geist-mono` (in `layout.tsx` auf `<html>`).
- Signalfarbe (`--theme-signal: #d4ff42`) NUR für primäre Aktionen, Zitat-Chips,
  aktive Zustände — nie für Fehler/Status. Text auf Signalfläche: `text-signal-ink`
  (Token `--theme-signal-ink: #0c1108`, nie hardcoded hex).
- Fehler/Destruktives: `text-danger` (Token `--theme-danger`, beide Paletten) auf
  neutraler Fläche (`bg-paper` + `border-line`) mit `alert`-Icon; Hover destruktiver
  Aktionen: `hover:bg-danger hover:text-danger-ink`. Nie `text-red-500`/hex.
- Gemeinsame Utilities (globals.css): `.ki-card`/`.ki-panel` (Surfaces), `.ki-soft`
  (Inputs/Hinweise), `.ki-pill` (Chips/Buttons), `.ki-tile` (Icon-Chips), `.ki-menu`
  (Dropdowns/Kontextmenüs), `.ki-enter` (Eintritts-Animation), `.ki-interactive`
  (Hover-Lift). Keine `rounded-none`/`border-ink`-Overrides auf diesen Klassen —
  das Soft-System gilt überall.
- Radius-Skala: `rounded-sm` (8px), `rounded-md` (16px), `rounded-lg` (24px), `rounded-full` (999px).
  Major surfaces = `lg`, content cards/inputs = `md`, inline chips/banners = `sm`.
- Border-Hierarchie: 1px für Divider (`border-t border-line/50`), 1.5px für Surface-Rahmen
  (`border-[1.5px] border-line`), 2px für Emphasis/Aktiv (`border-2 border-signal`).
- Shadow-Skala: `shadow-card`, `shadow-panel`, `shadow-pop` (hover/modal), `shadow-glow` (signal).
  Keine inline `shadow-[...]` Werte.
- `text-muted` für sekundäre Texte verwenden (nicht `text-ink/NN` Hacks).
  `text-ink/80` für Body-Copy, `text-ink/90` für Quell-Viewer.
- Dark Mode: `:root[data-theme="dark"]`. Beide Paletten pflegen.
- Datenzugriff: Repositories nehmen `db: Db` als ersten Parameter (Injection).
  Prod: `getDb()` (Neon-HTTP — KEINE Transaktionen!). Tests: `createTestDb()` (PGlite + echte Migrationen).
- Autorisierung im Repo-Layer: Queries immer mit `visitorId` absichern (Vorbild: `getNotebook`).
- Quellen-Ingestion: alle externen SDKs (`unpdf`, `@mozilla/readability`, `linkedom`,
  `youtubei.js`, `openai`, `@anthropic-ai/sdk`, `@vercel/blob/client`) werden in Tests
  immer mit `vi.mock` ersetzt — nie echte Netzwerk-/API-Aufrufe. Extraktions-Module
  werfen ausschließlich `IngestionError` (`src/lib/ingestion/errors.ts`) mit einer
  fertigen deutschen Meldung; der Orchestrator (`processSource`) normalisiert alle
  anderen Fehler zu einer generischen Meldung und wirft selbst niemals nach außen.
- Tests: `npm test` (Vitest, sequenziell, offline). Vor Commits: `npm test && npx tsc --noEmit && npm run lint && npm run build`.

## Dokumente
- Design-Spec: docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md
- Pläne: docs/superpowers/plans/

## Next.js-Doku
Next.js-Dokumentation liegt unter node_modules/next/dist/docs/ (bei Framework-Fragen zuerst dort nachsehen).
