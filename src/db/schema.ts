import {
  pgTable, text, integer, timestamp, boolean, jsonb, uniqueIndex, index, serial, real,
} from "drizzle-orm/pg-core";

/** A company we watch. Created by the business owner. */
export const competitor = pgTable("competitor", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Removed by the owner: hidden from the feed, Setup and the Claude connector, and no longer checked.
   * The row and its history stay, so a removal can be undone and old judgments keep their evidence.
   */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Who added it: "settings", "wizard", or "claude:<person key>" when added through the Claude connector. */
  addedBy: text("added_by"),
}, (t) => [uniqueIndex("competitor_domain_uq").on(t.domain)]);

export type SourceKind = "feed" | "listing" | "page";
export type FetchMode = "http" | "browser";
/** For watched pages: which skill reads the page. "general" = text diff + gate; "pricing" = plans and prices compared field by field. */
export type PageType = "general" | "pricing";

/** Where we look. Kind decides the detection path. Technical settings are operator-owned. */
export const source = pgTable("source", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id").notNull().references(() => competitor.id),
  kind: text("kind").$type<SourceKind>().notNull(),
  url: text("url").notNull(),
  label: text("label").notNull(),
  fetchMode: text("fetch_mode").$type<FetchMode>().notNull().default("http"),
  /** For listing pages: only links whose path starts with this prefix count as posts. */
  linkPrefix: text("link_prefix"),
  pageType: text("page_type").$type<PageType>().notNull().default("general"),
  active: boolean("active").notNull().default(true),
  /** Set after the first successful crawl; everything seen before it is baseline. */
  baselinedAt: timestamp("baselined_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastNewItemAt: timestamp("last_new_item_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("source_url_uq").on(t.url)]);

/** Extracted main text of a watched page or a post at a point in time. */
export const snapshot = pgTable("snapshot", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => source.id),
  url: text("url").notNull(),
  title: text("title"),
  text: text("text").notNull(),
  normalizedHash: text("normalized_hash").notNull(),
  /** Structured reading of the page, for page types that have one (pricing: plans, prices, features). */
  structured: jsonb("structured"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("snapshot_source_url_idx").on(t.sourceId, t.url, t.fetchedAt)]);

export type ItemKind = "post" | "page_change";
export type ItemStatus =
  | "baseline"      // seen on first crawl, never judged or sent
  | "cosmetic"      // page change the gate judged cosmetic
  | "pending"       // waiting for judgment
  | "judged"
  | "held"          // judgment failed the evidence check or was refused
  | "failed";

/** Something that happened: a new post, or a change to a watched page. */
export const item = pgTable("item", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => source.id),
  competitorId: integer("competitor_id").notNull().references(() => competitor.id),
  kind: text("kind").$type<ItemKind>().notNull(),
  url: text("url").notNull(),
  title: text("title"),
  /** Publication date only when the source states it; never the time we saw it. */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  text: text("text").notNull(),
  beforeText: text("before_text"),
  diff: text("diff"),
  gateReason: text("gate_reason"),
  status: text("status").$type<ItemStatus>().notNull(),
  statusDetail: text("status_detail"),
  /** Dedupe key: post URL for posts, source + new hash for page changes. */
  dedupeKey: text("dedupe_key").notNull(),
  isCanary: boolean("is_canary").notNull().default(false),
  /** One of the latest posts found on a source's first check: judged, labelled, never an urgent alert. */
  isBackfill: boolean("is_backfill").notNull().default(false),
  /** An earlier item of the same competitor that reports the same story, as the judge saw it. */
  relatedItemId: integer("related_item_id"),
  /** What this item adds to the related one, in one sentence. */
  storyNote: text("story_note"),
}, (t) => [uniqueIndex("item_dedupe_uq").on(t.dedupeKey), index("item_status_idx").on(t.status)]);

export type NoiseLevel = "quiet" | "normal";

/** A consuming team. Lens is plain English written by the owner and inserted into the prompt. */
export const team = pgTable("team", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  lens: text("lens").notNull(),
  noise: text("noise").$type<NoiseLevel>().notNull().default("normal"),
  /** Name of the env var holding this team's Slack webhook. The URL itself is a secret. */
  slackWebhookEnv: text("slack_webhook_env").notNull(),
  dailyAlertCap: integer("daily_alert_cap").notNull().default(5),
}, (t) => [uniqueIndex("team_key_uq").on(t.key)]);

export const topic = pgTable("topic", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** Team keys this topic matters to. */
  teamKeys: jsonb("team_keys").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
});

export type Level = "alert" | "digest" | "log" | "none";

/** One team's judgment of one item. */
export const judgment = pgTable("judgment", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => item.id),
  teamKey: text("team_key").notNull(),
  level: text("level").$type<Level>().notNull(),
  why: text("why").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull(),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  evidenceOk: boolean("evidence_ok").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("judgment_item_team_uq").on(t.itemId, t.teamKey)]);

export type DeliveryKind = "alert" | "digest" | "ops" | "owner";

/** A Slack post. The key makes retries safe: one key, one post. */
export const delivery = pgTable("delivery", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  kind: text("kind").$type<DeliveryKind>().notNull(),
  teamKey: text("team_key"),
  judgmentIds: jsonb("judgment_ids").$type<number[]>().notNull().default([]),
  status: text("status").$type<"sending" | "sent">().notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("delivery_key_uq").on(t.key)]);

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  judgmentId: integer("judgment_id").notNull().references(() => judgment.id),
  useful: boolean("useful").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const run = pgTable("run", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").$type<"running" | "ok" | "partial" | "failed">().notNull(),
  trigger: text("trigger").notNull(),
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  error: text("error"),
});

export const sourceRun = pgTable("source_run", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => run.id),
  sourceId: integer("source_id").notNull().references(() => source.id),
  ok: boolean("ok").notNull(),
  httpStatus: integer("http_status"),
  textLength: integer("text_length"),
  newItems: integer("new_items").notNull().default(0),
  error: text("error"),
  durationMs: integer("duration_ms"),
});

/** Every model call, for cost caps and the operator view. */
export const usage = pgTable("usage", {
  id: serial("id").primaryKey(),
  runId: integer("run_id"),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small key-value settings, such as the canary page text the operator edits. */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SuggestionStatus = "pending" | "approved" | "dismissed" | "superseded";
export interface ProposedTopic { name: string; description: string; teamKeys: string[] }

/**
 * A suggested update to the owner's text, drafted when Noma's own site changes. Nothing changes until
 * the owner approves it in Settings. A newer suggestion for the same page replaces a pending one.
 */
export const ownerSuggestion = pgTable("owner_suggestion", {
  id: serial("id").primaryKey(),
  pageUrl: text("page_url").notNull(),
  status: text("status").$type<SuggestionStatus>().notNull().default("pending"),
  whatChanged: text("what_changed").notNull(),
  /** Page text the change is measured from: the text when the last suggestion for this page was decided. */
  baseText: text("base_text").notNull(),
  newText: text("new_text").notNull(),
  company: text("company"),
  newTopics: jsonb("new_topics").$type<ProposedTopic[]>().notNull().default([]),
  changedTopics: jsonb("changed_topics").$type<ProposedTopic[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => [index("owner_suggestion_status_idx").on(t.status)]);

/** Every earlier version of an owner text, so a change can be seen and undone. */
export const ownerTextHistory = pgTable("owner_text_history", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  /** Who replaced it: "owner" (edited in Settings), "suggestion" (approved), "restore". */
  replacedBy: text("replaced_by").notNull(),
  replacedAt: timestamp("replaced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("owner_text_history_key_idx").on(t.key)]);

/**
 * Exam items the owner added in the app, from a team's "not useful" vote. Same shape as a file in
 * evals/golden; the live exam reads both. The files stay the versioned set for `npm run eval`.
 */
export const goldenItem = pgTable("golden_item", {
  id: text("id").primaryKey(),
  fromItemId: integer("from_item_id").notNull().references(() => item.id),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("golden_item_from_item_uq").on(t.fromItemId)]);

export type PersonRole = "owner" | "member";

/**
 * A person in the app, other than the builder (who is fixed). An owner manages their team; a member
 * reads their team's changes. Removing someone keeps the row, so the seed never brings them back.
 */
export const person = pgTable("person", {
  id: serial("id").primaryKey(),
  /** The "view as" key. */
  key: text("key").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  role: text("role").$type<PersonRole>().notNull(),
  teamKey: text("team_key").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("person_key_uq").on(t.key)]);

/**
 * Every call to the Claude connector (MCP server): who asked, which tool, with what arguments, and
 * whether it worked. The audit trail for the one tool that writes (add_competitor).
 */
export const mcpCall = pgTable("mcp_call", {
  id: serial("id").primaryKey(),
  personKey: text("person_key").notNull(),
  role: text("role").notNull(),
  tool: text("tool").notNull(),
  args: jsonb("args").notNull().default({}),
  ok: boolean("ok").notNull(),
  /** "read", "preview" or "write". */
  effect: text("effect").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("mcp_call_created_idx").on(t.createdAt)]);

export type TeamEditStatus = "checking" | "ready" | "saved" | "saved_anyway" | "discarded" | "failed";

/**
 * An owner's edit to their team's description, checked on the golden set before it goes live.
 * "checking": the evals are running with the draft. "ready": done, waiting for the owner because
 * something got worse. "saved": live (by itself when nothing got worse, or after a fix).
 * "saved_anyway": live although something got worse; the builder was told.
 */
export const teamEdit = pgTable("team_edit", {
  id: serial("id").primaryKey(),
  teamKey: text("team_key").notNull(),
  lens: text("lens").notNull(),
  /** The description it replaces, so the owner sees both. */
  previousLens: text("previous_lens").notNull(),
  status: text("status").$type<TeamEditStatus>().notNull(),
  /** The eval run with the draft (EvalResult), once finished. */
  result: jsonb("result"),
  /** The baseline it was compared with (EvalResult), frozen at the time of the check. */
  baseline: jsonb("baseline"),
  error: text("error"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => [index("team_edit_team_idx").on(t.teamKey)]);

/**
 * A team owner's own answer for one golden-set item, which replaces the answer key for that team only.
 * Owners keep their column of the answer key current without touching files or other teams.
 */
export const goldenAnswer = pgTable("golden_answer", {
  goldenId: text("golden_id").notNull(),
  teamKey: text("team_key").notNull(),
  level: text("level").notNull(),
  setBy: text("set_by").notNull(),
  setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("golden_answer_uq").on(t.goldenId, t.teamKey)]);
