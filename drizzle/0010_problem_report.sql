CREATE TABLE "problem_report" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"page" text NOT NULL,
	"reporter_key" text NOT NULL,
	"reporter_name" text NOT NULL,
	"reporter_role" text NOT NULL,
	"reporter_team" text,
	"user_agent" text,
	"status" text DEFAULT 'open' NOT NULL,
	"file_name" text,
	"file_type" text,
	"file_size" integer,
	"file_data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "problem_report_status_idx" ON "problem_report" USING btree ("status");