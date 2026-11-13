CREATE TABLE "mcp_call" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_key" text NOT NULL,
	"role" text NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"effect" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "added_by" text;--> statement-breakpoint
CREATE INDEX "mcp_call_created_idx" ON "mcp_call" USING btree ("created_at");