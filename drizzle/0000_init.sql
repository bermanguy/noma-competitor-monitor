CREATE TABLE "competitor" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"team_key" text,
	"judgment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"judgment_id" integer NOT NULL,
	"useful" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"competitor_id" integer NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"before_text" text,
	"diff" text,
	"gate_reason" text,
	"status" text NOT NULL,
	"status_detail" text,
	"dedupe_key" text NOT NULL,
	"is_canary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgment" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"team_key" text NOT NULL,
	"level" text NOT NULL,
	"why" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ok" boolean NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"trigger" text NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"normalized_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" serial PRIMARY KEY NOT NULL,
	"competitor_id" integer NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"fetch_mode" text DEFAULT 'http' NOT NULL,
	"link_prefix" text,
	"active" boolean DEFAULT true NOT NULL,
	"baselined_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_new_item_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"ok" boolean NOT NULL,
	"http_status" integer,
	"text_length" integer,
	"new_items" integer DEFAULT 0 NOT NULL,
	"error" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"lens" text NOT NULL,
	"noise" text DEFAULT 'normal' NOT NULL,
	"slack_webhook_env" text NOT NULL,
	"daily_alert_cap" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"team_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_judgment_id_judgment_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."judgment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment" ADD CONSTRAINT "judgment_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_run" ADD CONSTRAINT "source_run_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_run" ADD CONSTRAINT "source_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_domain_uq" ON "competitor" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_key_uq" ON "delivery" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "item_dedupe_uq" ON "item" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "item_status_idx" ON "item" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "judgment_item_team_uq" ON "judgment" USING btree ("item_id","team_key");--> statement-breakpoint
CREATE INDEX "snapshot_source_url_idx" ON "snapshot" USING btree ("source_id","url","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_url_uq" ON "source" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "team_key_uq" ON "team" USING btree ("key");