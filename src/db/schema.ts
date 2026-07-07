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
  index,
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notebook = pgTable(
  "notebook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitor.id),
    title: text("title").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notebook_visitor_id_idx").on(t.visitorId)]
);

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessage = pgTable("chat_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  role: chatRole("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const artifact = pgTable("artifact", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebook.id, { onDelete: "cascade" }),
  type: artifactType("type").notNull(),
  status: artifactStatus("status").notNull().default("pending"),
  content: jsonb("content"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
