CREATE TABLE "golden_item" (
	"id" text PRIMARY KEY NOT NULL,
	"from_item_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "golden_item" ADD CONSTRAINT "golden_item_from_item_id_item_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "golden_item_from_item_uq" ON "golden_item" USING btree ("from_item_id");