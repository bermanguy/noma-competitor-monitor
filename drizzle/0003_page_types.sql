ALTER TABLE "snapshot" ADD COLUMN "structured" jsonb;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "page_type" text DEFAULT 'general' NOT NULL;