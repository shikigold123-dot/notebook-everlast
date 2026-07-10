# Everlast × Open Notebook — Funktionsvergleich und Roadmap

Stand: 10. Juli 2026. Referenz: `lfnovo/open-notebook` v1.10.0 und dessen
öffentliche Feature-Dokumentation.

## Bereits in Everlast vorhanden oder in dieser Ausbaustufe verbessert

- Multi-Notebook-Verwaltung mit besuchergebundener Autorisierung
- PDF-, Text-, Website-, YouTube-, Audio- und Deep-Research-Quellen
- Quellenbasierter Chat mit Streaming, klickbaren Zitaten, Modellwahl und
  eigener Systemanweisung
- Feingranulare Kontextauswahl für Quellen und persistente eigene Notizen
- Studio-Ausgaben: Study Guide, FAQ, Timeline, Briefing, Mindmap, Video-Konzept,
  Präsentation, Karteikarten, Quiz, Infografik, Website, Datentabelle und Glossar
- Anpassbarer Detailgrad und Freitext-Anweisungen für Generierungen
- Audio Overview mit Dialogskript, OpenAI-/ElevenLabs-TTS und MP3-Ausgabe
- Quellen- und Artefakt-Viewer, Löschaktionen und robuste Fehlerzustände
- Deutsches, responsives Dossier-UI mit Hell-/Dunkelmodus

## Priorisierte nächste Lücken

1. **Mehrere Chat-Sitzungen pro Notebook**
   Getrennte Gesprächsfäden mit Titel, Umbenennen, Löschen und kontextbezogenem
   Verlauf statt eines einzigen globalen Chats.
2. **Notebook-weite Suche**
   Volltextsuche über Quellen, Notizen, Chats und Studio-Ausgaben mit direkten
   Sprungzielen. Vektorsuche folgt erst, wenn Embeddings providerneutral und
   kostensicher betrieben werden können.
3. **Wiederverwendbare Transformationen**
   Eigene Prompt-Aktionen speichern und auf ausgewählte Quellen oder Notizen
   anwenden; Ergebnisse wahlweise als Notiz oder Studio-Artefakt sichern.
4. **Provider-Abstraktion**
   Neben OpenRouter konfigurierbare OpenAI-kompatible Endpunkte und lokale
   Modelle (z. B. Ollama/LM Studio), einschließlich Verbindungstest.
5. **Fortgeschrittener Podcast-Editor**
   Sprecherprofile, 1–4 Rollen, Skriptbearbeitung vor TTS und erneutes Rendern
   einzelner Abschnitte.
6. **Asynchrone Jobs und Live-Updates**
   Dauerhafte Job-Queue und Server-Events für Ingestion, Recherche, Studio und
   Audio statt prozesslokaler Hintergrundarbeit bzw. Polling.
7. **Import/Export und offene API-Dokumentation**
   Notebook-Export, Quellenwiederverwendung und dokumentierte REST-Schnittstelle.

## Technische Leitplanken

- Neon-HTTP bleibt transaktionslos; mehrstufige Jobs müssen idempotent sein.
- Jeder Repository-Zugriff bleibt über `visitorId` autorisiert.
- Externe SDKs bleiben in Tests vollständig gemockt; die Suite läuft offline.
- Neue Funktionen übernehmen Everlasts deutsche UI und das Dossier-Design,
  statt die Oberfläche von Open Notebook zu kopieren.
