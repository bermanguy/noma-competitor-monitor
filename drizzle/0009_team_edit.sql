CREATE TABLE "golden_answer" (
	"golden_id" text NOT NULL,
	"team_key" text NOT NULL,
	"level" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_edit" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_key" text NOT NULL,
	"lens" text NOT NULL,
	"previous_lens" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"baseline" jsonb,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "golden_answer_uq" ON "golden_answer" USING btree ("golden_id","team_key");--> statement-breakpoint
CREATE INDEX "team_edit_team_idx" ON "team_edit" USING btree ("team_key");