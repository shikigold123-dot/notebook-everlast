# Everlast Phase 1 „Fundament" — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lauffähiges Next.js-Fundament für Everlast: Datenbank-Schema, anonyme Besucher-Sessions, Dossier-Design-System und das 3-Panel-Layout mit Notebook-Verwaltung.

**Architecture:** Ein Next.js-Projekt (App Router) auf Vercel-Zielarchitektur. Neon Postgres via Drizzle ORM; Tests laufen gegen PGlite (In-Memory-Postgres) mit denselben Migrationen. Besucher werden per Middleware-Cookie identifiziert, die Visitor-Zeile entsteht lazy beim ersten Schreibzugriff.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS v4, Drizzle ORM, @neondatabase/serverless, @electric-sql/pglite (Tests), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md`

## Global Constraints

- Alle UI-Texte auf **Deutsch**
- Design-Tokens exakt: Flächen `#f2f2ef`, Hintergrund `#e9e9e6`, Tinte `#1a1a1a`, Signalfarbe `#ffd23f`
- Formsprache: keine Rundungen (`border-radius: 0`), harte 1,5–2px-Linien, keine Schatten, Versalien-Labels mit Letter-Spacing
- Kein UI-Kit — eigene Komponenten
- Limits aus Env-Variablen mit Spec-Defaults (u. a. `LIMIT_NOTEBOOKS_PER_VISITOR` = 5)
- TypeScript strict; Tests ohne echte Netzwerk-/DB-Abhängigkeiten (PGlite statt Neon)
- Commits nach jedem Task, deutsche Commit-Messages mit conventional-commit-Präfix

---

### Task 1: Projekt-Scaffold + Test-Toolchain

**Files:**
- Create: komplettes Next.js-Scaffold (via `create-next-app`, dann Merge ins Projektverzeichnis)
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/sanity.test.ts`
- Create: `.env.example`
- Modify: `.gitignore` (Projekt-Einträge wiederherstellen)
- Modify: `package.json` (Test-Scripts)

**Interfaces:**
- Consumes: —
- Produces: `npm test` (Vitest, jsdom, Alias `@/* → src/*`), `npm run dev`; alle späteren Tasks bauen auf diesem Scaffold auf

- [ ] **Step 1: Next.js in temporäres Verzeichnis scaffolden und ins Projekt mergen**

Das Projektverzeichnis ist nicht leer (`docs/`, `.git/`, `.superpowers/`), `create-next-app` verweigert das. Deshalb: in Temp-Verzeichnis scaffolden, dann rüberkopieren.

```bash
cd /Users/matin/notebook_everlast
npx create-next-app@latest /tmp/everlast-scaffold \
  --typescript --app --tailwind --eslint --src-dir \
  --import-alias "@/*" --use-npm --no-turbopack --yes
rsync -a --exclude .git /tmp/everlast-scaffold/ .
rm -rf /tmp/everlast-scaffold
```

- [ ] **Step 2: .gitignore-Einträge wiederherstellen**

`create-next-app` hat unsere `.gitignore` überschrieben. Anhängen:

```bash
printf '\n# Projekt\n.superpowers/\n' >> .gitignore
```

Prüfen, dass `.env*` bereits drinsteht (Standard bei create-next-app) — falls nicht, ebenfalls anhängen.

- [ ] **Step 3: Test-Dependencies installieren**

```bash
npm install -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 4: Vitest konfigurieren**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

In `package.json` unter `"scripts"` ergänzen:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Sanity-Test schreiben**

`tests/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("Toolchain", () => {
  it("führt Tests aus", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Test laufen lassen**

Run: `npm test`
Expected: `1 passed` — die Toolchain steht.

- [ ] **Step 7: .env.example anlegen**

`.env.example`:

```bash
# Neon Postgres (https://neon.tech — Free Tier reicht)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Limits (optional — Defaults siehe src/lib/limits.ts)
# LIMIT_NOTEBOOKS_PER_VISITOR=5
# LIMIT_SOURCES_PER_NOTEBOOK=8
# LIMIT_TOKENS_PER_NOTEBOOK=100000
# LIMIT_CHAT_PER_VISITOR_DAY=30
# LIMIT_ARTIFACTS_PER_VISITOR_DAY=10
```

- [ ] **Step 8: Dev-Server kurz prüfen**

Run: `npm run dev` — http://localhost:3000 zeigt die Next.js-Default-Seite. Danach abbrechen (Ctrl+C).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: Next.js-Scaffold mit Vitest-Toolchain"
```

---

### Task 2: Design-Tokens & Grundlayout („Dossier"-System)

**Files:**
- Modify: `src/app/globals.css` (komplett ersetzen)
- Modify: `src/app/layout.tsx` (komplett ersetzen)
- Delete: `src/app/page.tsx`-Inhalt wird in Task 9 ersetzt (hier unangetastet lassen)

**Interfaces:**
- Consumes: Scaffold aus Task 1
- Produces: Tailwind-Utilities `bg-paper`, `bg-ground`, `text-ink`, `bg-signal`, `border-ink`, `font-mono`, `font-sans`; CSS-Klasse `.label-caps`; Root-Layout mit `lang="de"`

- [ ] **Step 1: globals.css durch Dossier-Tokens ersetzen**

`src/app/globals.css` (kompletter Inhalt):

```css
@import "tailwindcss";

@theme inline {
  --color-paper: #f2f2ef;
  --color-ground: #e9e9e6;
  --color-ink: #1a1a1a;
  --color-signal: #ffd23f;
  --font-mono: var(--font-plex-mono), ui-monospace, Menlo, monospace;
  --font-sans: var(--font-plex-sans), system-ui, sans-serif;
  --radius: 0;
}

body {
  background: var(--color-ground);
  color: var(--color-ink);
}

/* Versalien-Label — wiederkehrendes Dossier-Element */
.label-caps {
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-family: var(--font-mono);
  font-size: 0.6875rem; /* 11px */
}
```

- [ ] **Step 2: Root-Layout mit Fonts und Deutsch**

`src/app/layout.tsx` (kompletter Inhalt):

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-mono",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

export const metadata: Metadata = {
  title: "Everlast",
  description:
    "Quellen hochladen, mit ihnen chatten, Artefakte und Podcasts generieren — die NotebookLM-Alternative im Dossier-Format.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body
        className={`${plexMono.variable} ${plexSans.variable} font-mono antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich, keine Typ- oder CSS-Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: Dossier-Design-Tokens und deutsches Grundlayout"
```

---

### Task 3: UI-Basiskomponenten (SectionLabel, ActionButton, Panel)

**Files:**
- Create: `src/components/ui/SectionLabel.tsx`
- Create: `src/components/ui/ActionButton.tsx`
- Create: `src/components/ui/Panel.tsx`
- Test: `tests/components/ui.test.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 2
- Produces:
  - `SectionLabel({ children, count?: number })` — Versalien-Label, optional mit `[n]`-Zähler
  - `ActionButton({ children, variant?: "primary" | "outline", ...buttonProps })` — `primary` = Signalgelb, `outline` = Rahmen; erbt alle nativen Button-Props
  - `Panel({ label, count?, children, className? })` — Rahmenkasten mit SectionLabel-Kopf

- [ ] **Step 1: Failing Tests schreiben**

`tests/components/ui.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ActionButton } from "@/components/ui/ActionButton";
import { Panel } from "@/components/ui/Panel";

describe("SectionLabel", () => {
  it("rendert den Text als Versalien-Label", () => {
    render(<SectionLabel>Quellen</SectionLabel>);
    const el = screen.getByText("Quellen");
    expect(el).toHaveClass("label-caps");
  });

  it("zeigt den Zähler in eckigen Klammern", () => {
    render(<SectionLabel count={3}>Quellen</SectionLabel>);
    expect(screen.getByText("[3]")).toBeInTheDocument();
  });

  it("zeigt ohne count keinen Zähler", () => {
    render(<SectionLabel>Quellen</SectionLabel>);
    expect(screen.queryByText(/\[\d+\]/)).not.toBeInTheDocument();
  });
});

describe("ActionButton", () => {
  it("rendert primary mit Signalfarbe", () => {
    render(<ActionButton variant="primary">Anlegen</ActionButton>);
    const btn = screen.getByRole("button", { name: "Anlegen" });
    expect(btn.className).toContain("bg-signal");
  });

  it("rendert outline mit Rahmen ohne Signalfläche", () => {
    render(<ActionButton variant="outline">Abbrechen</ActionButton>);
    const btn = screen.getByRole("button", { name: "Abbrechen" });
    expect(btn.className).toContain("border-ink");
    expect(btn.className).not.toContain("bg-signal");
  });

  it("reicht native Props durch (disabled)", () => {
    render(<ActionButton disabled>Warten</ActionButton>);
    expect(screen.getByRole("button", { name: "Warten" })).toBeDisabled();
  });
});

describe("Panel", () => {
  it("rendert Label-Kopf und Inhalt", () => {
    render(
      <Panel label="Studio">
        <p>Inhalt</p>
      </Panel>
    );
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/components/ui/SectionLabel'`

- [ ] **Step 3: Komponenten implementieren**

`src/components/ui/SectionLabel.tsx`:

```tsx
export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  // children liegen direkt im Label-Element (kein Wrapper-Span),
  // damit getByText das Element mit der label-caps-Klasse findet.
  return (
    <span className="label-caps inline-flex items-baseline gap-2 bg-ink px-1.5 py-0.5 text-paper">
      {children}
      {count !== undefined && <span>[{count}]</span>}
    </span>
  );
}
```

`src/components/ui/ActionButton.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
};

export function ActionButton({
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const base =
    "label-caps cursor-pointer px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary:
      "border-[1.5px] border-ink bg-signal text-ink hover:bg-ink hover:text-signal",
    outline: "border-[1.5px] border-ink bg-paper text-ink hover:bg-ink hover:text-paper",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
```

`src/components/ui/Panel.tsx`:

```tsx
import { SectionLabel } from "./SectionLabel";

export function Panel({
  label,
  count,
  children,
  className = "",
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col border-[1.5px] border-ink bg-paper ${className}`}
    >
      <header className="border-b-[1.5px] border-ink px-3 py-2">
        <SectionLabel count={count}>{label}</SectionLabel>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test`
Expected: PASS (alle 7 Tests grün)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui tests/components
git commit -m "feat: Dossier-Basiskomponenten SectionLabel, ActionButton, Panel"
```

---

### Task 4: Drizzle-Schema, Migration & PGlite-Testinfrastruktur

**Files:**
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/` (generierte Migration)
- Create: `tests/helpers/db.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: Scaffold aus Task 1
- Produces:
  - Alle Tabellen aus Spec Abschnitt 5 als Drizzle-Objekte: `visitor`, `notebook`, `source`, `chatMessage`, `artifact`, `audioOverview`, `usageCounter`
  - `createTestDb(): Promise<TestDb>` — migrierte In-Memory-DB für alle DB-Tests

- [ ] **Step 1: DB-Dependencies installieren**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit @electric-sql/pglite
```

- [ ] **Step 2: Schema schreiben**

`src/db/schema.ts`:

```ts
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  boolean,
  integer,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", [
  "pdf",
  "text",
  "url",
  "youtube",
  "audio",
]);
export const sourceStatus = pgEnum("source_status", [
  "pending",
  "processing",
  "ready",
  "error",
]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);
export const artifactType = pgEnum("artifact_type", [
  "study_guide",
  "faq",
  "timeline",
  "briefing",
  "mindmap",
]);
export const artifactStatus = pgEnum("artifact_status", [
  "pending",
  "ready",
  "error",
]);
export const audioStatus = pgEnum("audio_status", [
  "queued",
  "script",
  "synthesizing",
  "ready",
  "error",
]);

export const visitor = pgTable("visitor", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notebook = pgTable("notebook", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitorId: uuid("visitor_id")
    .notNull()
    .references(() => visitor.id),
  title: text("title").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const source = pgTable("source", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  type: sourceType("type").notNull(),
  status: sourceStatus("status").notNull().default("pending"),
  title: text("title").notNull(),
  errorMessage: text("error_message"),
  originalUrl: text("original_url"),
  blobUrl: text("blob_url"),
  content: text("content"),
  tokenCount: integer("token_count"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatMessage = pgTable("chat_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  role: chatRole("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const artifact = pgTable("artifact", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  type: artifactType("type").notNull(),
  status: artifactStatus("status").notNull().default("pending"),
  content: jsonb("content"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const audioOverview = pgTable("audio_overview", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  status: audioStatus("status").notNull().default("queued"),
  script: jsonb("script"),
  audioBlobUrl: text("audio_blob_url"),
  durationS: integer("duration_s"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usageCounter = pgTable(
  "usage_counter",
  {
    scope: text("scope").notNull(),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.metric] })]
);
```

- [ ] **Step 3: Drizzle-Kit konfigurieren und Migration generieren**

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder",
  },
});
```

```bash
npx drizzle-kit generate --name init
```

Expected: `drizzle/0000_init.sql` (+ `drizzle/meta/`) mit allen 7 Tabellen und 6 Enums.

- [ ] **Step 4: Test-DB-Helper schreiben**

`tests/helpers/db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
```

- [ ] **Step 5: Failing Schema-Roundtrip-Test schreiben**

`tests/db/schema.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createTestDb } from "../helpers/db";
import { visitor, notebook, usageCounter } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Schema", () => {
  it("legt Visitor und Notebook an und liest sie zurück", async () => {
    const db = await createTestDb();
    const [v] = await db.insert(visitor).values({}).returning();
    const [nb] = await db
      .insert(notebook)
      .values({ visitorId: v.id, title: "Kant" })
      .returning();

    const rows = await db
      .select()
      .from(notebook)
      .where(eq(notebook.visitorId, v.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Kant");
    expect(rows[0].isDemo).toBe(false);
    expect(nb.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("erzwingt den zusammengesetzten Primärschlüssel auf usage_counter", async () => {
    const db = await createTestDb();
    await db
      .insert(usageCounter)
      .values({ scope: "global:2026-07-06", metric: "chat", value: 1 });

    await expect(
      db
        .insert(usageCounter)
        .values({ scope: "global:2026-07-06", metric: "chat", value: 2 })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Test laufen lassen — erst FAIL, dann Migration prüfen**

Run: `npm test -- tests/db/schema.test.ts`
Expected: PASS, sofern Schema + Migration korrekt generiert wurden. Schlägt er mit „relation does not exist" fehl, wurde Step 3 (generate) vergessen oder `migrationsFolder` zeigt falsch.

Hinweis: PGlite lädt WASM — der erste Lauf dauert einige Sekunden.

- [ ] **Step 7: Commit**

```bash
git add src/db drizzle drizzle.config.ts tests/helpers tests/db package.json package-lock.json
git commit -m "feat: Drizzle-Schema mit Migration und PGlite-Testinfrastruktur"
```

---

### Task 5: DB-Client & Limits-Helper

**Files:**
- Create: `src/db/index.ts`
- Create: `src/lib/limits.ts`
- Test: `tests/lib/limits.test.ts`

**Interfaces:**
- Consumes: `schema.ts` aus Task 4
- Produces:
  - `getDb(): Db` — lazy initialisierter Neon-Client (Produktion)
  - `type Db` — treiberunabhängiger DB-Typ, den alle Repositories als Parameter nehmen (Neon in Prod, PGlite in Tests)
  - `LIMITS` — Objekt mit Gettern: `notebooksPerVisitor`, `sourcesPerNotebook`, `tokensPerNotebook`, `chatPerVisitorDay`, `artifactsPerVisitorDay`

- [ ] **Step 1: Failing Limits-Test schreiben**

`tests/lib/limits.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { LIMITS } from "@/lib/limits";

afterEach(() => {
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
});

describe("LIMITS", () => {
  it("liefert den Spec-Default ohne Env-Variable", () => {
    expect(LIMITS.notebooksPerVisitor).toBe(5);
  });

  it("liest den Wert aus der Env-Variable", () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "9";
    expect(LIMITS.notebooksPerVisitor).toBe(9);
  });

  it("fällt bei unbrauchbarem Env-Wert auf den Default zurück", () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "quatsch";
    expect(LIMITS.notebooksPerVisitor).toBe(5);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/limits.test.ts`
Expected: FAIL — `Cannot find module '@/lib/limits'`

- [ ] **Step 3: limits.ts implementieren**

`src/lib/limits.ts`:

```ts
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Spec Abschnitt 7 — alle Werte per Env-Variable übersteuerbar. */
export const LIMITS = {
  get notebooksPerVisitor() {
    return intFromEnv("LIMIT_NOTEBOOKS_PER_VISITOR", 5);
  },
  get sourcesPerNotebook() {
    return intFromEnv("LIMIT_SOURCES_PER_NOTEBOOK", 8);
  },
  get tokensPerNotebook() {
    return intFromEnv("LIMIT_TOKENS_PER_NOTEBOOK", 100_000);
  },
  get chatPerVisitorDay() {
    return intFromEnv("LIMIT_CHAT_PER_VISITOR_DAY", 30);
  },
  get artifactsPerVisitorDay() {
    return intFromEnv("LIMIT_ARTIFACTS_PER_VISITOR_DAY", 10);
  },
};
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/limits.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 5: DB-Client implementieren**

`src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Treiberunabhängiger DB-Typ: Repositories nehmen `Db` als Parameter,
 * damit Tests eine PGlite-Instanz injizieren können.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema }) as unknown as Db;
  }
  return _db;
}
```

Hinweis: Der `as unknown as Db`-Cast gleicht die treiberspezifischen Query-Result-Typen (Neon vs. PGlite) auf den gemeinsamen Basistyp an. Falls der PGlite-Testhelper aus Task 4 beim Übergeben an Repositories einen Typfehler wirft, dort ebenso `as unknown as Db` beim Aufruf casten — zur Laufzeit sind beide vollständige Drizzle-Postgres-Instanzen.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/db/index.ts src/lib/limits.ts tests/lib
git commit -m "feat: DB-Client mit treiberunabhängigem Db-Typ und Limits-Helper"
```

---

### Task 6: Besucher-Cookie (Middleware + ensureVisitor)

**Files:**
- Create: `src/lib/visitor.ts`
- Create: `src/middleware.ts`
- Test: `tests/lib/visitor.test.ts`

**Interfaces:**
- Consumes: `Db` aus Task 5, `visitor`-Tabelle aus Task 4
- Produces:
  - `VISITOR_COOKIE = "everlast_visitor"` und `UUID_RE` (RegExp)
  - `ensureVisitor(db: Db, id: string): Promise<void>` — legt die Visitor-Zeile idempotent an
  - `readVisitorId(cookieStore: { get(name: string): { value: string } | undefined }): string | null` — liest + validiert das Cookie
  - Middleware, die jedem Request ohne Cookie eine neue Besucher-UUID setzt (Request UND Response, damit die Seite sie im selben Request sieht)

- [ ] **Step 1: Failing Tests schreiben**

`tests/lib/visitor.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createTestDb } from "../helpers/db";
import { ensureVisitor, readVisitorId, UUID_RE } from "@/lib/visitor";
import { visitor } from "@/db/schema";
import type { Db } from "@/db";

const VALID_ID = "6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";

describe("ensureVisitor", () => {
  it("legt die Zeile an und ist idempotent", async () => {
    const db = (await createTestDb()) as unknown as Db;
    await ensureVisitor(db, VALID_ID);
    await ensureVisitor(db, VALID_ID); // zweiter Aufruf darf nicht werfen
    const rows = await db.select().from(visitor);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(VALID_ID);
  });
});

describe("readVisitorId", () => {
  it("liefert eine gültige UUID aus dem Cookie", () => {
    const store = { get: () => ({ value: VALID_ID }) };
    expect(readVisitorId(store)).toBe(VALID_ID);
  });

  it("liefert null ohne Cookie", () => {
    const store = { get: () => undefined };
    expect(readVisitorId(store)).toBeNull();
  });

  it("liefert null bei ungültigem Format (kein DB-Fehler später)", () => {
    const store = { get: () => ({ value: "nicht-uuid'; DROP TABLE--" }) };
    expect(readVisitorId(store)).toBeNull();
  });
});

describe("UUID_RE", () => {
  it("akzeptiert Großschreibung", () => {
    expect(UUID_RE.test(VALID_ID.toUpperCase())).toBe(true);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test -- tests/lib/visitor.test.ts`
Expected: FAIL — `Cannot find module '@/lib/visitor'`

- [ ] **Step 3: visitor.ts implementieren**

`src/lib/visitor.ts`:

```ts
import { visitor } from "@/db/schema";
import type { Db } from "@/db";

export const VISITOR_COOKIE = "everlast_visitor";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legt die Visitor-Zeile an, falls sie fehlt (idempotent). */
export async function ensureVisitor(db: Db, id: string): Promise<void> {
  await db.insert(visitor).values({ id }).onConflictDoNothing();
}

/** Liest die Besucher-ID aus dem Cookie-Store; null bei fehlendem/ungültigem Wert. */
export function readVisitorId(cookieStore: {
  get(name: string): { value: string } | undefined;
}): string | null {
  const value = cookieStore.get(VISITOR_COOKIE)?.value;
  if (!value || !UUID_RE.test(value)) return null;
  return value;
}
```

- [ ] **Step 4: Middleware implementieren**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, UUID_RE } from "@/lib/visitor";

export function middleware(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();
  // Aufs Request-Objekt setzen, damit Server Components im selben
  // Request die ID schon sehen — dann in die Response übernehmen.
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request });
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Statische Assets und Next-Interna auslassen
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Tests laufen lassen — müssen bestehen**

Run: `npm test -- tests/lib/visitor.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/visitor.ts src/middleware.ts tests/lib/visitor.test.ts
git commit -m "feat: anonyme Besucher-Sessions per Middleware-Cookie"
```

---

### Task 7: Notebook-Repository

**Files:**
- Create: `src/db/repo/notebooks.ts`
- Test: `tests/db/notebooks.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 5), `notebook`-Schema (Task 4), `ensureVisitor` (Task 6), `LIMITS` (Task 5)
- Produces:
  - `class LimitExceededError extends Error`
  - `listNotebooks(db: Db, visitorId: string)` — eigene Notebooks, älteste zuerst
  - `createNotebook(db: Db, visitorId: string, title: string)` — legt Visitor lazy an, wirft `LimitExceededError` ab Limit
  - `getNotebook(db: Db, visitorId: string, id: string)` — liefert das Notebook, wenn es dem Besucher gehört ODER `isDemo` ist; sonst `null`

- [ ] **Step 1: Failing Tests schreiben**

`tests/db/notebooks.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import {
  listNotebooks,
  createNotebook,
  getNotebook,
  LimitExceededError,
} from "@/db/repo/notebooks";
import { notebook, visitor } from "@/db/schema";
import type { Db } from "@/db";

const VISITOR_A = "aaaaaaaa-0000-4000-8000-000000000001";
const VISITOR_B = "bbbbbbbb-0000-4000-8000-000000000002";

let db: Db;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
});

afterEach(() => {
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
});

describe("createNotebook", () => {
  it("legt Visitor lazy an und erstellt das Notebook", async () => {
    const nb = await createNotebook(db, VISITOR_A, "Kant");
    expect(nb.title).toBe("Kant");
    expect(nb.visitorId).toBe(VISITOR_A);
    const visitors = await db.select().from(visitor);
    expect(visitors).toHaveLength(1);
  });

  it("wirft LimitExceededError ab dem Limit", async () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "2";
    await createNotebook(db, VISITOR_A, "Eins");
    await createNotebook(db, VISITOR_A, "Zwei");
    await expect(createNotebook(db, VISITOR_A, "Drei")).rejects.toThrow(
      LimitExceededError
    );
  });
});

describe("listNotebooks", () => {
  it("liefert nur eigene Notebooks, älteste zuerst", async () => {
    await createNotebook(db, VISITOR_A, "Erstes");
    await createNotebook(db, VISITOR_A, "Zweites");
    await createNotebook(db, VISITOR_B, "Fremd");

    const rows = await listNotebooks(db, VISITOR_A);
    expect(rows.map((n) => n.title)).toEqual(["Erstes", "Zweites"]);
  });
});

describe("getNotebook", () => {
  it("liefert das eigene Notebook", async () => {
    const created = await createNotebook(db, VISITOR_A, "Meins");
    const found = await getNotebook(db, VISITOR_A, created.id);
    expect(found?.id).toBe(created.id);
  });

  it("liefert null für fremde Notebooks", async () => {
    const created = await createNotebook(db, VISITOR_A, "Meins");
    const found = await getNotebook(db, VISITOR_B, created.id);
    expect(found).toBeNull();
  });

  it("liefert Demo-Notebooks für jeden", async () => {
    const created = await createNotebook(db, VISITOR_A, "Demo");
    await db
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, created.id));
    const found = await getNotebook(db, VISITOR_B, created.id);
    expect(found?.isDemo).toBe(true);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test -- tests/db/notebooks.test.ts`
Expected: FAIL — `Cannot find module '@/db/repo/notebooks'`

- [ ] **Step 3: Repository implementieren**

`src/db/repo/notebooks.ts`:

```ts
import { and, asc, count, eq } from "drizzle-orm";
import { notebook } from "@/db/schema";
import type { Db } from "@/db";
import { ensureVisitor } from "@/lib/visitor";
import { LIMITS } from "@/lib/limits";

export class LimitExceededError extends Error {}

export async function listNotebooks(db: Db, visitorId: string) {
  return db
    .select()
    .from(notebook)
    .where(eq(notebook.visitorId, visitorId))
    .orderBy(asc(notebook.createdAt));
}

export async function createNotebook(
  db: Db,
  visitorId: string,
  title: string
) {
  await ensureVisitor(db, visitorId);

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(notebook)
    .where(
      and(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, false))
    );

  if (existing >= LIMITS.notebooksPerVisitor) {
    throw new LimitExceededError(
      `Maximal ${LIMITS.notebooksPerVisitor} Dossiers pro Besucher — lösch eins, um Platz zu schaffen.`
    );
  }

  const [created] = await db
    .insert(notebook)
    .values({ visitorId, title })
    .returning();
  return created;
}

export async function getNotebook(db: Db, visitorId: string, id: string) {
  const rows = await db
    .select()
    .from(notebook)
    .where(eq(notebook.id, id))
    .limit(1);
  const nb = rows[0];
  if (!nb) return null;
  if (nb.visitorId !== visitorId && !nb.isDemo) return null;
  return nb;
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test -- tests/db/notebooks.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/repo tests/db/notebooks.test.ts
git commit -m "feat: Notebook-Repository mit Besucher-Limit und Demo-Zugriff"
```

---

### Task 8: API-Route /api/notebooks

**Files:**
- Create: `src/app/api/notebooks/route.ts`
- Test: `tests/api/notebooks.test.ts`

**Interfaces:**
- Consumes: `getDb` (Task 5, im Test gemockt), `readVisitorId` (Task 6), Repository (Task 7)
- Produces:
  - `GET /api/notebooks` → `200 { notebooks: [...] }` (leer ohne gültiges Cookie)
  - `POST /api/notebooks` mit `{ title?: string }` → `201 { notebook }`; ohne Titel → `"Unbenanntes Dossier"`; Limit → `429 { error }` (deutsch); ohne Cookie → `401 { error }`

- [ ] **Step 1: Failing Tests schreiben**

`tests/api/notebooks.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";

// DB-Modul mocken: Die Route bekommt unsere PGlite-Instanz
let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

// next/headers mocken: cookies() liefert unseren Fake-Store
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

import { GET, POST } from "@/app/api/notebooks/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  cookieValue = VISITOR;
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/notebooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks", () => {
  it("legt ein Notebook an (201)", async () => {
    const res = await POST(postRequest({ title: "Kant" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notebook.title).toBe("Kant");
  });

  it("nutzt den Default-Titel ohne title", async () => {
    const res = await POST(postRequest({}));
    const json = await res.json();
    expect(json.notebook.title).toBe("Unbenanntes Dossier");
  });

  it("liefert 429 mit deutscher Meldung ab dem Limit", async () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "1";
    await POST(postRequest({ title: "Eins" }));
    const res = await POST(postRequest({ title: "Zwei" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Maximal 1");
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ title: "X" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/notebooks", () => {
  it("listet die Notebooks des Besuchers", async () => {
    await POST(postRequest({ title: "Kant" }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notebooks).toHaveLength(1);
  });

  it("liefert eine leere Liste ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notebooks).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test -- tests/api/notebooks.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/notebooks/route'`

- [ ] **Step 3: Route implementieren**

`src/app/api/notebooks/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import {
  createNotebook,
  listNotebooks,
  LimitExceededError,
} from "@/db/repo/notebooks";

export async function GET() {
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ notebooks: [] });
  }
  const notebooks = await listNotebooks(getDb(), visitorId);
  return NextResponse.json({ notebooks });
}

export async function POST(request: Request) {
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Unbenanntes Dossier";

  try {
    const created = await createNotebook(getDb(), visitorId, title);
    return NextResponse.json({ notebook: created }, { status: 201 });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test -- tests/api/notebooks.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api tests/api
git commit -m "feat: Notebook-API mit Limit- und Session-Behandlung"
```

---

### Task 9: Dashboard-Seite (Dossier-Übersicht)

**Files:**
- Create: `src/components/dashboard/NotebookList.tsx`
- Modify: `src/app/page.tsx` (komplett ersetzen)
- Test: `tests/components/notebook-list.test.tsx`

**Interfaces:**
- Consumes: `Panel`/`ActionButton`/`SectionLabel` (Task 3), `getDb`/`readVisitorId`/`listNotebooks` (Tasks 5–7), `POST /api/notebooks` (Task 8)
- Produces: Dashboard unter `/` — Liste aller Dossiers mit laufender Nummer (`DOSSIER 001`, `002`, …), Button „NEUES DOSSIER", Klick auf Eintrag → `/notebook/[id]`

- [ ] **Step 1: Failing Test für die Liste schreiben**

`tests/components/notebook-list.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotebookList } from "@/components/dashboard/NotebookList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const NOTEBOOKS = [
  { id: "id-1", title: "Kant", createdAt: "2026-07-01T10:00:00Z" },
  { id: "id-2", title: "Nietzsche", createdAt: "2026-07-02T10:00:00Z" },
];

describe("NotebookList", () => {
  it("nummeriert die Dossiers fortlaufend", () => {
    render(<NotebookList notebooks={NOTEBOOKS} />);
    expect(screen.getByText("DOSSIER 001")).toBeInTheDocument();
    expect(screen.getByText("DOSSIER 002")).toBeInTheDocument();
    expect(screen.getByText("Kant")).toBeInTheDocument();
  });

  it("zeigt den Anlegen-Button", () => {
    render(<NotebookList notebooks={[]} />);
    expect(
      screen.getByRole("button", { name: /neues dossier/i })
    ).toBeInTheDocument();
  });

  it("zeigt den Leer-Zustand ohne Notebooks", () => {
    render(<NotebookList notebooks={[]} />);
    expect(screen.getByText(/noch keine dossiers/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/components/notebook-list.test.tsx`
Expected: FAIL — `Cannot find module '@/components/dashboard/NotebookList'`

- [ ] **Step 3: NotebookList implementieren**

`src/components/dashboard/NotebookList.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/ActionButton";

export type NotebookListItem = {
  id: string;
  title: string;
  createdAt: string;
};

export function NotebookList({
  notebooks,
}: {
  notebooks: NotebookListItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Das hat nicht geklappt — bitte nochmal versuchen.");
      return;
    }
    const { notebook } = await res.json();
    router.push(`/notebook/${notebook.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="label-caps !text-sm">Deine Dossiers</h1>
        <ActionButton onClick={handleCreate} disabled={busy}>
          {busy ? "Wird angelegt …" : "Neues Dossier"}
        </ActionButton>
      </div>

      {error && (
        <p className="border-[1.5px] border-ink bg-signal px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {notebooks.length === 0 ? (
        <p className="border-[1.5px] border-dashed border-ink bg-paper p-6 text-sm">
          Noch keine Dossiers. Leg dein erstes an — Quellen rein, Fragen
          stellen, Podcast raus.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((nb, i) => (
            <li key={nb.id}>
              <Link
                href={`/notebook/${nb.id}`}
                className="block border-[1.5px] border-ink bg-paper p-4 transition-colors hover:bg-signal"
              >
                <span className="label-caps block text-ink/60">
                  {`DOSSIER ${String(i + 1).padStart(3, "0")}`}
                </span>
                <span className="mt-2 block text-lg font-medium">
                  {nb.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/components/notebook-list.test.tsx`
Expected: PASS (3 Tests)

- [ ] **Step 5: Dashboard-Page implementieren**

`src/app/page.tsx` (kompletter Inhalt):

```tsx
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { listNotebooks } from "@/db/repo/notebooks";
import { NotebookList } from "@/components/dashboard/NotebookList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const visitorId = readVisitorId(await cookies());
  const notebooks = visitorId
    ? await listNotebooks(getDb(), visitorId)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-baseline justify-between border-b-2 border-ink pb-4">
        <span className="text-xl font-bold tracking-widest">EVERLAST</span>
        <span className="label-caps text-ink/60">
          Quellen · Chat · Studio
        </span>
      </header>
      <NotebookList
        notebooks={notebooks.map((nb) => ({
          id: nb.id,
          title: nb.title,
          createdAt: nb.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 6: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich. (Die Seite braucht zur Laufzeit `DATABASE_URL`; der Build selbst darf keine DB-Verbindung öffnen — `force-dynamic` verhindert Prerendering.)

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/dashboard tests/components/notebook-list.test.tsx
git commit -m "feat: Dashboard mit Dossier-Liste und Anlegen-Flow"
```

---

### Task 10: Notebook-Workspace (3-Panel-Layout)

**Files:**
- Create: `src/components/workspace/NotebookWorkspace.tsx`
- Create: `src/app/notebook/[id]/page.tsx`
- Test: `tests/components/workspace.test.tsx`

**Interfaces:**
- Consumes: `Panel` (Task 3), `getNotebook`/`listNotebooks` (Task 7), `readVisitorId` (Task 6)
- Produces:
  - `NotebookWorkspace({ notebook: { id, title, number } })` — Header + drei Panels (Quellen / Chat / Studio) mit Platzhaltern; Phase 2–5 füllen die Panels
  - Route `/notebook/[id]` mit Besitz-Prüfung (fremd + kein Demo → 404)

- [ ] **Step 1: Failing Test schreiben**

`tests/components/workspace.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

const NB = { id: "id-1", title: "Kant", number: "004" };

describe("NotebookWorkspace", () => {
  it("zeigt Dossier-Nummer und Titel im Header", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText(/DOSSIER 004/)).toBeInTheDocument();
    expect(screen.getByText(/KANT/)).toBeInTheDocument();
  });

  it("rendert die drei Panels", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText("Quellen")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
  });

  it("zeigt die Platzhalter-Texte", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
    expect(
      screen.getByText(/füge zuerst quellen hinzu/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/components/workspace.test.tsx`
Expected: FAIL — `Cannot find module '@/components/workspace/NotebookWorkspace'`

- [ ] **Step 3: Workspace-Komponente implementieren**

`src/components/workspace/NotebookWorkspace.tsx`:

```tsx
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";

export type WorkspaceNotebook = {
  id: string;
  title: string;
  /** Laufende Nummer des Besuchers, z. B. "004" */
  number: string;
};

export function NotebookWorkspace({
  notebook,
}: {
  notebook: WorkspaceNotebook;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between border-b-2 border-ink bg-paper px-4 py-2">
        <Link href="/" className="text-lg font-bold tracking-widest">
          EVERLAST
        </Link>
        <span className="label-caps">
          DOSSIER {notebook.number} / {notebook.title.toUpperCase()}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr_280px]">
        <Panel label="Quellen" count={0}>
          <p className="text-sm text-ink/60">
            Noch keine Quellen. PDF, Website, YouTube oder Audio — kommt in
            Phase 2 hierher.
          </p>
        </Panel>

        <Panel label="Chat">
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-ink/60">
              Füge zuerst Quellen hinzu, dann kannst du hier Fragen stellen —
              mit Zitaten direkt aus deinen Dokumenten.
            </p>
            <input
              disabled
              placeholder="Frag deine Quellen …"
              className="border-[1.5px] border-ink bg-paper px-3 py-2 text-sm disabled:opacity-40"
            />
          </div>
        </Panel>

        <Panel label="Studio">
          <ul className="flex flex-col gap-2 text-sm text-ink/60">
            <li className="border border-dashed border-ink p-2">
              ▶ Audio Overview
            </li>
            <li className="border border-dashed border-ink p-2">Study Guide</li>
            <li className="border border-dashed border-ink p-2">Mind Map</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/components/workspace.test.tsx`
Expected: PASS (3 Tests)

- [ ] **Step 5: Route implementieren**

`src/app/notebook/[id]/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { readVisitorId, UUID_RE } from "@/lib/visitor";
import { getNotebook, listNotebooks } from "@/db/repo/notebooks";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

export const dynamic = "force-dynamic";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId || !UUID_RE.test(id)) notFound();

  const db = getDb();
  const nb = await getNotebook(db, visitorId, id);
  if (!nb) notFound();

  // Laufende Nummer = Position in der Liste des Besitzers
  const all = await listNotebooks(db, nb.visitorId);
  const position = all.findIndex((n) => n.id === nb.id) + 1;

  return (
    <NotebookWorkspace
      notebook={{
        id: nb.id,
        title: nb.title,
        number: String(position).padStart(3, "0"),
      }}
    />
  );
}
```

- [ ] **Step 6: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 7: Commit**

```bash
git add src/app/notebook src/components/workspace tests/components/workspace.test.tsx
git commit -m "feat: Notebook-Workspace mit 3-Panel-Dossier-Layout"
```

---

### Task 11: Abschluss — Gesamtlauf & manuelle Verifikation

**Files:**
- Create: `README.md`
- Modify: keine Code-Änderungen erwartet (nur Fixes, falls die Verifikation etwas findet)

**Interfaces:**
- Consumes: alles aus Tasks 1–10
- Produces: verifiziertes Phase-1-Fundament, dokumentierter Setup-Weg

- [ ] **Step 1: Kompletten Test-Lauf ausführen**

Run: `npm test`
Expected: Alle Tests aus Tasks 1–10 grün (mind. 26 Tests), keine Skips.

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler.

- [ ] **Step 2: README schreiben**

`README.md`:

```markdown
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
```

- [ ] **Step 3: Manuelle Verifikation im Browser**

Vorbedingung: `DATABASE_URL` in `.env.local`, Migration eingespielt (`npx drizzle-kit migrate`), `npm run dev`.

Checkliste:
1. http://localhost:3000 → Dashboard lädt, Dossier-Design sichtbar (helles Grau-Beige, schwarze Linien, Monospace-Labels)
2. Cookie `everlast_visitor` wurde gesetzt (DevTools → Application → Cookies)
3. „NEUES DOSSIER" klicken → Weiterleitung auf `/notebook/[id]`, Workspace zeigt Header `DOSSIER 001 / UNBENANNTES DOSSIER` und drei Panels
4. Zurück zum Dashboard → das Dossier erscheint in der Liste
5. 5 weitere Dossiers anlegen → beim 6. erscheint die Limit-Meldung („Maximal 5 …")
6. URL eines Dossiers in einem privaten Fenster öffnen (anderes Cookie) → 404
7. Responsive-Kurzcheck: Fenster schmal ziehen → Panels stapeln sich untereinander

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README mit Setup-Anleitung für Phase 1"
```

---

## Ausblick

Die Folgephasen bekommen jeweils einen eigenen Plan nach demselben Muster:

- **Phase 2 — Quellen:** Ingestion aller fünf Typen (Blob-Upload, PDF-Extraktion, Readability, YouTube-Transkript, Whisper), Status-UI, Quellen-Limits
- **Phase 3 — Chat + Zitate:** SSE-Streaming, native Citations, Prompt Caching, Quellen-Viewer mit Markierung
- **Phase 4 — Artefakte + Mind Map:** JSON-Schemas, strukturierte Generierung, React-Flow-Rendering
- **Phase 5 — Audio Overview:** Skript-Generierung, ElevenLabs-Pipeline, Player
- **Phase 6 — Härtung:** Budget-Not-Aus, Demo-Seed, Fehlerpfade, Playwright-Smoke, Vercel-Deployment
