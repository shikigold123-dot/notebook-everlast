# Everlast Phase 2 — Quellen-Ingestion (Technisches Design-Addendum)

**Datum:** 2026-07-08
**Status:** Vom Auftraggeber abgenommen
**Bezug:** Baut auf `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md` auf (Produkt-Spec Abschnitt 6.1 „Quellen-Ingestion", Datenmodell Abschnitt 5, Bauphasen Abschnitt 11). Dieses Dokument klärt die technischen Umsetzungsfragen, die im Produkt-Spec offen gelassen wurden — es ersetzt Abschnitt 6.1 nicht, sondern konkretisiert ihn.

## 1. Zweck & Rahmen

Phase 2 implementiert das Hinzufügen von Quellen aller fünf Typen (PDF, Text/Markdown, Website, YouTube, Audio) zu einem Notebook, inklusive Upload, Extraktion, Status-Anzeige und Fehlerbehandlung. Chat, Artefakte und Audio Overview (Phasen 3–5) bauen auf den hier entstehenden `source`-Zeilen auf, sind aber nicht Teil dieser Phase.

## 2. Neue Abhängigkeiten

| Paket | Zweck |
|---|---|
| `@vercel/blob` | Client-Upload-Token, Blob-Zugriff serverseitig |
| `unpdf` | PDF-Textextraktion mit Seiten-Grenzen |
| `@mozilla/readability` | Artikel-Extraktion aus Website-HTML |
| `linkedom` | Schlankes DOM-Parsing für Readability (kein `node-canvas`, serverless-tauglich) |
| `youtubei.js` | YouTube-Transkript-Abruf |
| `openai` | Nur für Whisper-Transkription (Audio-Quellen) |

## 3. API-Oberfläche

Alle Routen unter `/api/notebooks/:id/sources`, autorisiert über `getNotebook(db, visitorId, id)` wie in Phase 1 etabliert — kein Zugriff auf fremde, nicht-Demo-Notebooks.

| Route | Zweck |
|---|---|
| `POST /api/notebooks/:id/blob-upload-token` | Kurzlebiges Client-Upload-Token für Vercel Blob (nur für Typen `pdf`/`audio`) |
| `POST /api/notebooks/:id/sources` | Legt Quelle an (`status: pending`), prüft Limits, stößt Verarbeitung an, antwortet sofort |
| `GET /api/notebooks/:id/sources` | Liste aller Quellen des Notebooks (Grundlage fürs Polling) |
| `POST /api/notebooks/:id/sources/:sourceId/retry` | Setzt `status` zurück auf `pending`, stößt Verarbeitung erneut an |
| `DELETE /api/notebooks/:id/sources/:sourceId` | Löscht eine Quelle |

**Request-Body für `POST .../sources`** je nach `type`:
- `text`: `{ type: "text", title, content }` — Inhalt kommt direkt mit
- `pdf`/`audio`: `{ type, title, blobUrl }` — Blob-URL vom vorherigen Client-Upload
- `url`: `{ type: "url", originalUrl }` — Titel wird beim Extrahieren aus der Seite übernommen
- `youtube`: `{ type: "youtube", originalUrl }` — Titel wird aus den Video-Metadaten übernommen

## 4. Verarbeitungs-Pipeline

Einheitlicher Mechanismus für alle fünf Typen, implementiert in `src/lib/ingestion/`:

```
process(source) → Inhalt holen → Text extrahieren → Tokens zählen (Claude count_tokens) → content/token_count/meta schreiben, status=ready
                                                                                          ↘ bei Fehler: status=error, error_message (Deutsch)
```

**Ausführungsmodell:** Alle vier extern-abhängigen Typen (`pdf`, `url`, `youtube`, `audio`) laufen über Next.js `after()` — die POST-Route legt die Zeile mit `status: pending` an und antwortet sofort, die eigentliche Verarbeitung läuft danach im selben Serverless-Invocation-Kontext weiter. Das ist der einzige Verarbeitungspfad; es gibt keinen separaten synchronen Pfad für schnelle Typen. Grund: ein Codepfad für alle Typen, robust gegen Vercels Funktions-Zeitlimit (Whisper-Transkription eines 30-Minuten-Files kann deutlich länger dauern als PDF/Website/YouTube).

**Ausnahme `text`:** Kein externer Abruf nötig — wird synchron in der POST-Route auf `status: ready` gesetzt, ohne `after()`.

**Pro Typ:**

| Typ | Holen | Extrahieren | `meta`-Feld |
|---|---|---|---|
| `text` | — (im Request-Body) | — | — |
| `pdf` | Blob-URL laden (`fetch`) | `unpdf` → Text pro Seite | `{ pages: [{ page, start, end }] }` (Zeichen-Offsets pro Seite im zusammengesetzten `content`) |
| `url` | `fetch(originalUrl)` | `linkedom` parsen → `@mozilla/readability` extrahiert Artikel-Text + Titel | — |
| `youtube` | `youtubei.js` Transkript + Metadaten abrufen | Segmente zu Fließtext zusammenfügen, Titel aus Metadaten übernehmen | `{ segments: [{ start_s, end_s, text_offset }] }` |
| `audio` | Blob-URL laden | OpenAI Whisper API transkribiert | `{ duration_s }` |

Nach der Extraktion: `token_count` wird über `client.messages.countTokens()` (Claude API, Modell `claude-opus-4-8`) bestimmt — konsistent mit dem Chat-Prompt in Phase 3, der dieselben Texte einbettet.

## 5. Limits (Durchsetzung vor Anlage der Quelle)

Wiederverwendung der `LIMITS`-Getter aus Phase 1 (`src/lib/limits.ts`), ergänzt um:

| Limit | Wert | Prüfzeitpunkt |
|---|---|---|
| Quellen pro Notebook | `LIMITS.sourcesPerNotebook` (Default 8) | Vor `POST .../sources` — zählt alle Status außer bereits gelöschte |
| Tokens pro Notebook (Summe aller `ready`-Quellen) | `LIMITS.tokensPerNotebook` (Default 100.000) | Nach der Extraktion, vor dem Setzen auf `ready` — überschreitet eine Quelle das Budget, wird sie stattdessen auf `error` mit entsprechender Meldung gesetzt (nicht vorher abbrechbar, da die Token-Zahl erst nach Extraktion bekannt ist) |
| Upload-Größe PDF | 15 MB | Client-seitig vor Upload, serverseitig erneut bei `POST .../sources` (Blob-Metadaten) |
| Upload-Größe/-Dauer Audio | 25 MB / 30 min | Client-seitig vor Upload; Dauer erst nach Whisper-Antwort bekannt — bei Überschreitung `error` |

Limit-Überschreitungen liefern `429 { error }` mit deutscher Meldung, analog zum Notebook-Limit aus Phase 1.

## 6. UI

**Quellen-Panel** (`src/components/workspace/SourcesPanel.tsx`, Client-Komponente, ersetzt den Platzhalter aus `NotebookWorkspace`):
- Formular mit Typ-Auswahl; je nach Typ Datei-Picker (`pdf`/`audio`), Textfeld (`text`), URL-Feld (`url`/`youtube`)
- Liste bestehender Quellen mit Status-Chip: `⏳ Verarbeitung …` / `✓ Bereit` / `⚠ Fehler` + `error_message` + „Erneut versuchen"-Button
- **Polling:** Solange mindestens eine Quelle `pending` oder `processing` ist, ruft die Komponente alle 2 Sekunden `GET .../sources` ab; sobald alle Quellen `ready`/`error` sind, stoppt das Polling automatisch (Interval wird bei Unmount und bei Terminierungsbedingung sauber aufgeräumt)

**Upload-Flow (PDF/Audio):**
1. Client validiert Dateigröße/-typ lokal (sofortiges Feedback)
2. Client holt Upload-Token von `POST .../blob-upload-token`
3. Client lädt direkt zu Vercel Blob hoch (`@vercel/blob/client`, mit Fortschrittsanzeige)
4. Client sendet `POST .../sources` mit der resultierenden Blob-URL

## 7. Fehlerbehandlung

- Client-seitige Validierung (Dateigröße/-typ, leere URL) verhindert die meisten Fehler vor jedem Request
- Serverseitige Limit-Prüfung: `429` mit deutscher Meldung
- Verarbeitungsfehler landen auf `status: error` mit spezifischer deutscher Meldung, z. B.:
  - „Für dieses Video ist kein Transkript verfügbar."
  - „Diese Website konnte nicht gelesen werden."
  - „Diese PDF-Datei ist beschädigt oder verschlüsselt."
  - „Die Transkription ist fehlgeschlagen — bitte erneut versuchen."
- Whisper-/Claude-API-Fehler laufen über dieselbe typisierte SDK-Exception-Kette wie in Phase 1 etabliert (most-specific-first: Rate-Limit vs. Server-Fehler vs. Client-Fehler)
- „Erneut versuchen" setzt `status` zurück auf `pending` und stößt die Pipeline erneut an; zählt nicht doppelt gegen das Quellen-Limit

## 8. Tests

- **Unit (Vitest):** je ein Test pro Extraktions-Funktion (`pdf`, `url`, `youtube`, `audio`) für Erfolgs- und mind. einen Fehlerpfad, externe Aufrufe gemockt (kein echter Netzwerk-/API-Verbrauch)
- **Integration (Vitest + PGlite):** API-Routen — Limit-Prüfung (Anzahl, Größe), Statuswechsel `pending → ready`/`error`, Retry-Verhalten, Besitz-Prüfung (analog Notebook-Repository)
- **Komponenten-Test:** Polling-Logik im Quellen-Panel mit gefaketen Timern (`vi.useFakeTimers`) — verifiziert, dass das Intervall bei „alle Quellen ready" stoppt und beim Unmount aufgeräumt wird

## 9. Nicht-Ziele dieser Phase

- Keine Chat-Integration (Phase 3 liest `source.content` für den Prompt-Aufbau)
- Keine Fortschrittsanzeige *innerhalb* der Whisper-Transkription (nur Status `processing` insgesamt, kein Prozent-Balken)
- Keine Bearbeitung von Quellen nach dem Anlegen (nur Anzeigen, Löschen, Retry)
