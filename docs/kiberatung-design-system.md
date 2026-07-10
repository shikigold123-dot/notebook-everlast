# Everlast Designsystem nach kiberatung.de

Stand: 2026-07-08

## Leitbild

Das Interface folgt dem visuellen Schema von kiberatung.de: helle Premium-Basis,
schwarze Typografie, Lime als einzige starke Aktionsfarbe, große runde Flächen
und ruhige Beratungs-/SaaS-Komposition. Dark Mode ist eine invertierte Variante,
nicht das primäre Erscheinungsbild.

## Tokens

- `ground`: Seitenhintergrund mit sehr hellem Grün-Grau.
- `paper`: primäre Kartenfläche.
- `panel`: leicht abgesetzte Kopf- und Arbeitsflächen.
- `panel-soft`: Eingaben, sekundäre Karten und Tool-Container.
- `ink`: Haupttext, nahezu schwarz im Light Mode.
- `signal`: Lime-Akzent für CTAs, aktive Zustände und Fortschritt.
- `line`: dezente Trennlinien.
- `muted`: Sekundärtext.

## Komponentenklassen

- `.ki-shell`: Seitenhintergrund mit subtiler Lime-Atmosphäre.
- `.ki-card`: primäre runde Karte.
- `.ki-panel`: große App-Panels.
- `.ki-soft`: sekundäre Oberflächen und Eingaben.
- `.ki-pill`: Navigation, Labels und Chips.
- `.ki-cta`: primäre Aktionen, aktive Tabs und Quellenmarken.

## Regeln

- Lime nur für primäre Aktionen, aktive Auswahl, Zitate und Fortschritt.
- Karten und Controls sind rund, aber nicht verspielt: meist `22px` bis `32px`.
- Text bleibt funktional und deutsch; keine erklärenden Marketing-Blöcke im Tool.
- Light Mode ist Standard; Dark Mode nutzt dieselben Rollen invertiert.
