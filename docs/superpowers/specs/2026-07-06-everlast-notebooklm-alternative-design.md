# Everlast — NotebookLM-Alternative (Design-Spec)

**Datum:** 2026-07-06
**Status:** Vom Auftraggeber abgenommen (Architektur, Datenmodell, Abläufe)
**Arbeitstitel:** Everlast

## 1. Zweck & Rahmen

Everlast ist eine NotebookLM-Alternative als **öffentliches Portfolio-/Showcase-Produkt**: Jeder Besucher kann ohne Account Quellen hochladen, mit ihnen chatten (mit klickbaren Zitaten), Artefakte generieren und einen KI-Podcast erzeugen. Das Produkt hebt sich durch ein eigenständiges Design ab („Archiv/Dossier"-Ästhetik) und ist auf kontrollierte Betriebskosten ausgelegt.

**UI-Sprache:** Deutsch. Chat und generierte Inhalte folgen der Sprache der Quellen bzw. der Nutzerfrage.

### Ziele (v1)

1. Quellen: PDF, Text/Markdown (Upload + Direkteingabe), Websites (URL), YouTube-Videos (Transkript), Audio-Dateien (Whisper-Transkription)
2. Chat über alle Quellen eines Notebooks mit **nativen, klickbaren Zitaten** (Klick öffnet Quellen-Viewer an exakter Textstelle)
3. Generierte Artefakte: Study Guide, FAQ, Timeline, Briefing-Dokument
4. Interaktive Mind Map der Quellen-Themen
5. Audio Overview: zwei KI-Stimmen diskutieren die Quellen als Podcast (Deutsch)
6. Vorbefülltes, schreibgeschütztes Demo-Notebook für den ersten Eindruck
7. Rate-Limits + globaler Tagesbudget-Not-Aus

### Nicht-Ziele (v1)

- Keine Accounts, kein Login, kein Teilen von Notebooks zwischen Besuchern
- Keine Bezahlfunktion
- Keine Mehrsprachigkeit des UI (nur Deutsch)
- Kein Google-Docs/Drive-Import
- Keine Mobile-App (responsive Web reicht)

## 2. Tech-Stack

| Bereich | Wahl |
|---|---|
| Framework | Next.js (App Router, TypeScript), Deployment auf Vercel |
| Styling | Tailwind CSS, eigenes „Dossier"-Design-System (kein UI-Kit) |
| Datenbank | Neon Postgres, Drizzle ORM |
| Datei-Speicher | Vercel Blob (Original-Uploads, fertige Podcast-MP3s) |
| LLM | Claude API (`claude-opus-4-8`, per Env umstellbar), Anthropic TypeScript SDK |
| Zitate | Native Citations der Claude API (`citations: {enabled: true}` auf Dokument-Blöcken) |
| TTS (Podcast) | ElevenLabs (zwei Voice-IDs) |
| STT (Audio-Quellen) | OpenAI Whisper API |
| Mind Map | React Flow |
| Tests | Vitest (Unit/Integration), Playwright (Smoke) |

## 3. Design-Richtung: „Archiv / Dossier"

Vom Auftraggeber aus drei Mockup-Varianten gewählt:

- **Typografie:** Monospace (UI-Beschriftungen, Labels, Daten) kombiniert mit einer gut lesbaren Grotesk für Fließtext in Chat/Artefakten
- **Farben:** Helles Grau-Beige (`#f2f2ef` Flächen, `#e9e9e6` Hintergrund), Tiefschwarz (`#1a1a1a`) für Linien und Text, **Gelb (`#ffd23f`) als einzige Signalfarbe** (primäre Aktionen, Zitat-Chips, aktive Zustände)
- **Formsprache:** Harte 1,5–2px-Linien statt Schatten, sichtbares Raster, keine Rundungen, Versalien-Labels mit Letter-Spacing (z. B. `QUELLEN [3]`)
- **Motiv:** Jedes Notebook ist ein „Dossier" mit laufender Nummer (`DOSSIER 004 / KANT`); Quellen tragen Kennungen `S-01`, `S-02`, … — diese Kennungen sind zugleich die Zitat-Chips im Chat
- **Layout:** Drei Panels — Quellen (links) · Chat (Mitte) · Studio (rechts); der Quellen-Viewer öffnet als Overlay/Panel über dem Quellen-Panel

## 4. Architektur

Ein Next.js-Projekt, vier Service-Module hinter den API-Routes:

```
Browser (3-Panel-UI, Deutsch, SSE)
   │
   ▼
Next.js API-Routes (Vercel) — davor: Rate-Limits + Budget-Deckel
   ├── Ingestion   (PDF-Text, Web-Scrape, YT-Transkript, Whisper)
   ├── Chat        (Dokument-Blöcke + native Zitate + Prompt Caching, SSE)
   ├── Artefakte   (strukturierte JSON-Ausgabe pro Artefakt-Typ)
   └── Audio       (Skript via Claude → ElevenLabs TTS → MP3, Hintergrund-Job)
   │
   ├── Claude API · ElevenLabs · OpenAI Whisper     (extern)
   └── Neon Postgres · Vercel Blob                  (Speicher)
```

### Zentraler Datenfluss (Chat mit Zitaten)

1. Jede Quelle wird beim Hinzufügen zu **normalisiertem Text** extrahiert und in Postgres gespeichert (PDFs mit Seiten-Offsets in `meta`)
2. Beim Chat gehen alle Quellen-Texte als **Dokument-Blöcke mit `citations: {enabled: true}`** an Claude — in stabiler Reihenfolge, `cache_control: {type: "ephemeral"}` auf dem letzten Dokument-Block
3. **Prompt Caching:** Quellen liegen im stabilen Prefix; die erste Frage zahlt den Cache-Write (×1,25), Folgefragen lesen mit ~0,1× — bei 100k-Token-Notebook: erste Frage ≈ 0,60 $, Folgefragen ≈ 0,05 $
4. Claude streamt die Antwort; Zitate kommen als `char_location` (Zeichen-Offsets im gespeicherten Text) mit `cited_text`
5. Das UI rendert Zitat-Chips (`[S-01]`); Klick öffnet den Quellen-Viewer und markiert die Textstelle über die Offsets

### Besucher-Modell (kein Auth)

- Anonyme Besucher-Session: UUID in einem HTTP-Only-Cookie, Zeile in `visitor`
- Notebooks gehören dem Besucher; kein Zugriff auf fremde Notebooks
- Ein Demo-Notebook (`is_demo = true`) wird per Seed-Skript angelegt und ist für alle lesbar, aber nicht veränderbar (Chat im Demo-Notebook ist erlaubt, zählt aber gegen die Besucher-Limits; Quellen/Artefakte des Demos sind fixiert)

## 5. Datenmodell (Neon Postgres, Drizzle)

| Tabelle | Felder (Kern) |
|---|---|
| `visitor` | `id` (uuid, Cookie), `created_at` |
| `notebook` | `id`, `visitor_id` FK, `title`, `is_demo`, `created_at`, `updated_at` |
| `source` | `id`, `notebook_id` FK, `type` (`pdf`\|`text`\|`url`\|`youtube`\|`audio`), `status` (`pending`\|`processing`\|`ready`\|`error`), `title`, `error_message`, `original_url`, `blob_url`, `content` (extrahierter Text), `token_count`, `meta` (JSON: Seiten-Offsets, Dauer, …), `created_at` |
| `chat_message` | `id`, `notebook_id` FK, `role` (`user`\|`assistant`), `content`, `citations` (JSON: `[{source_id, start, end, cited_text}]`), `created_at` |
| `artifact` | `id`, `notebook_id` FK, `type` (`study_guide`\|`faq`\|`timeline`\|`briefing`\|`mindmap`), `content` (JSON, schema-validiert), `status`, `created_at` |
| `audio_overview` | `id`, `notebook_id` FK, `status` (`queued`\|`script`\|`synthesizing`\|`ready`\|`error`), `script` (JSON: `[{speaker: "A"\|"B", text}]`), `audio_blob_url`, `duration_s`, `created_at` |
| `usage_counter` | `scope` (`visitor:<id>:<datum>` \| `global:<datum>`), `metric` (`chat`\|`artifact`\|`audio`\|`est_cost_cents`), `value` — Upsert mit Increment |

## 6. Feature-Spezifikationen

### 6.1 Quellen-Ingestion

| Typ | Verarbeitung |
|---|---|
| PDF | Upload → Blob → serverseitige Text-Extraktion mit Seiten-Offsets in `meta` |
| Text/Markdown | Upload oder Direkteingabe → direkt als `content` |
| Website | URL → Fetch → Readability-Extraktion (Artikel ohne Navigation/Werbung) |
| YouTube | URL → Transkript-Abruf → Transkript als `content` (Fehlermeldung, wenn kein Transkript verfügbar) |
| Audio | Upload → Blob → Whisper-Transkription → Transkript als `content` |

- `token_count` wird nach Extraktion über die Claude-API (`count_tokens`) bestimmt
- Status-Übergänge live im UI (Polling); `error` zeigt deutsche Meldung + „Erneut versuchen"
- Vor dem Hinzufügen wird geprüft: Quellen-Anzahl-Limit und Token-Limit des Notebooks

### 6.2 Chat mit Zitaten

- Route: `POST /api/notebooks/:id/chat` — SSE-Stream
- Prompt-Aufbau (Cache-freundlich, stabile Reihenfolge):
  1. System-Prompt (fix, eingefroren): Rolle, Zitierpflicht, Sprachverhalten
  2. Dokument-Blöcke aller `ready`-Quellen (sortiert nach `created_at`), jeweils `title` = Quellen-Kennung, `citations: {enabled: true}`; `cache_control` auf dem letzten Block
  3. Chatverlauf, danach die neue Frage
- Antwort-Streaming: Text-Deltas + Zitat-Blöcke werden client-seitig zu Text mit eingebetteten Chips zusammengesetzt; nach Stream-Ende wird die Nachricht inkl. `citations` persistiert
- `max_tokens` Chat: 4096

### 6.3 Artefakte

- Route: `POST /api/notebooks/:id/artifacts` mit `type`
- Jeder Typ hat ein festes JSON-Schema (strukturierte Ausgabe via `output_config.format`):
  - **Study Guide:** Abschnitte mit Kernkonzepten, Quizfragen (+ Antworten), Glossar
  - **FAQ:** Frage/Antwort-Paare
  - **Timeline:** chronologische Ereignisse (`date_label`, `title`, `description`)
  - **Briefing:** Zusammenfassung, Kernaussagen, Zitate, offene Fragen
  - **Mind Map:** hierarchischer Baum (`{label, children[]}`), max. Tiefe 3
- Hinweis: Strukturierte Ausgabe ist mit nativen Citations inkompatibel — Artefakte referenzieren Quellen nur über deren Kennungen im Text, nicht als klickbare Offsets
- Mind Map wird mit React Flow gerendert: Zoom, Pan, Äste ein-/ausklappen
- Artefakte sind persistiert und neu generierbar (ersetzt das alte Artefakt desselben Typs nicht — Liste mit Zeitstempel)

### 6.4 Audio Overview (Podcast)

- Route: `POST /api/notebooks/:id/audio` → legt `audio_overview` (`queued`) an, startet Hintergrund-Verarbeitung (Vercel `waitUntil` / Background Function)
- Schritt 1 (`script`): Claude generiert deutsches Dialog-Skript, strukturierte Ausgabe `[{speaker, text}]`, Ziel-Länge ~5–8 Minuten Sprechzeit, zwei Personas (neugierige Moderatorin, erklärender Experte)
- Schritt 2 (`synthesizing`): pro Turn ElevenLabs-TTS mit der jeweiligen Voice-ID; MP3-Segmente werden serverseitig aneinandergefügt (gleiches Encoding-Profil für alle Segmente)
- Ergebnis: MP3 in Vercel Blob, `status = ready`; UI pollt und zeigt Fortschritt („Skript wird geschrieben …", „Stimmen werden generiert …")
- Player im Studio-Panel: Play/Pause, Fortschrittsbalken, Download

## 7. Kosten-Limits & Schutz (alle Werte per Env-Variable)

| Limit | Standardwert |
|---|---|
| Quellen pro Notebook | 8 |
| Tokens pro Notebook (Summe aller Quellen) | 100.000 |
| Upload-Größe | PDF ≤ 15 MB · Audio ≤ 25 MB / 30 min |
| Chat-Nachrichten pro Besucher/Tag | 30 |
| Artefakte pro Besucher/Tag | 10 |
| Audio Overviews | 1 pro Notebook · 2 pro Besucher/Tag · 10 global/Tag |
| Notebooks pro Besucher | 5 |
| **Globaler Tagesbudget-Not-Aus** | konfigurierter Cent-Betrag; Kostenschätzung via Token-Usage aller Aufrufe in `usage_counter` |

- Durchsetzung in einer gemeinsamen Guard-Funktion vor jeder teuren Route (Postgres-Upsert-Counter; kein Redis nötig bei Portfolio-Traffic)
- Bei Überschreitung: HTTP 429 mit deutscher Meldung; UI zeigt Banner („Tageslimit erreicht — morgen geht's weiter")
- Budget überschritten → Chat/Artefakte/Audio pausieren global, Lesen bleibt möglich

## 8. Fehlerbehandlung

- **Ingestion:** Fehler pro Quelle isoliert (`status = error`, deutsche `error_message`, Retry-Button); andere Quellen unberührt
- **Claude API:** typisierte SDK-Exceptions, most-specific-first; 429/529 → „Gerade ist viel los, versuch es gleich nochmal"; `stop_reason: "refusal"` → neutrale Meldung („Dazu kann ich nichts sagen") statt Fehler
- **Streams:** Abbruch client- oder serverseitig verwirft die unvollständige Antwort; keine halben Nachrichten in der DB
- **Audio-Jobs:** Fehler → `status = error` mit Meldung; genau ein Retry erlaubt (zählt nicht doppelt gegen Limits)
- **Externe Ausfälle (ElevenLabs/Whisper):** gleiche Behandlung wie Claude-Fehler, mit dienstspezifischer Meldung

## 9. Tests

- **Unit (Vitest):** Parser-Normalisierung (PDF/URL/YouTube), Limit-/Guard-Logik, Zitat-Offset-Mapping (Citations → Viewer-Markierung)
- **Integration (Vitest):** API-Routen mit gemockten Anthropic/ElevenLabs/OpenAI-Clients — kein API-Verbrauch im CI
- **Smoke (Playwright):** Notebook anlegen → Textquelle hinzufügen → Frage stellen → Zitat-Chip klicken → Viewer markiert Textstelle (gegen gemockte LLM-Antwort)
- **Manuell:** Audio-Pipeline end-to-end (echte APIs), Demo-Notebook-Seed, Responsive-Check

## 10. Konfiguration (Env-Variablen)

```
ANTHROPIC_API_KEY          # Claude
ANTHROPIC_MODEL            # Default: claude-opus-4-8
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_A / _B    # zwei Podcast-Stimmen
OPENAI_API_KEY             # nur Whisper
DATABASE_URL               # Neon
BLOB_READ_WRITE_TOKEN      # Vercel Blob
LIMIT_*                    # alle Werte aus Abschnitt 7
DAILY_BUDGET_CENTS         # globaler Not-Aus
```

## 11. Bauphasen (Reihenfolge der Implementierung)

1. **Fundament:** Next.js-Setup, Drizzle-Schema + Migrationen, Besucher-Cookie, Dossier-Design-System (Tokens, Basiskomponenten), 3-Panel-Layout
2. **Quellen:** Ingestion aller fünf Typen inkl. Status-UI und Limits
3. **Chat + Zitate:** Streaming, Citations, Quellen-Viewer mit Markierung — der Kern des Produkts
4. **Artefakte + Mind Map:** Schemas, Generierung, Rendering
5. **Audio Overview:** Skript-Generierung, ElevenLabs-Pipeline, Player
6. **Härtung:** Budget-Not-Aus, Demo-Notebook-Seed, Fehlerpfade, Tests, Deployment auf Vercel

Jede Phase ist einzeln lauffähig und demo-bar; die Phasen 2–5 hängen jeweils nur vom Fundament ab (3 zusätzlich von 2).
