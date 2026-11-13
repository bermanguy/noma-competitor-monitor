CREATE TABLE "competitor_logo" (
	"competitor_id" integer PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_logo" ADD CONSTRAINT "competitor_logo_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE no action ON UPDATE no action;