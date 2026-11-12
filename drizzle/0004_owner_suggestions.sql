CREATE TABLE "owner_suggestion" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"what_changed" text NOT NULL,
	"base_text" text NOT NULL,
	"new_text" text NOT NULL,
	"company" text,
	"new_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "owner_text_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"replaced_by" text NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "owner_suggestion_status_idx" ON "owner_suggestion" USING btree ("status");--> statement-breakpoint
CREATE INDEX "owner_text_history_key_idx" ON "owner_text_history" USING btree ("key");