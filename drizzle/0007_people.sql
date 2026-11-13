CREATE TABLE "person" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"role" text NOT NULL,
	"team_key" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "person_key_uq" ON "person" USING btree ("key");--> statement-breakpoint
INSERT INTO "person" ("key", "name", "title", "role", "team_key") VALUES
  ('marketing', 'Maya', 'Head of Marketing', 'owner', 'marketing'),
  ('product', 'Daniel', 'Head of Product', 'owner', 'product'),
  ('rnd', 'Noa', 'VP R&D', 'owner', 'rnd'),
  ('lior', 'Lior', 'Product Marketing Manager', 'member', 'marketing'),
  ('tamar', 'Tamar', 'Product Manager', 'member', 'product'),
  ('omer', 'Omer', 'Backend Engineer', 'member', 'rnd')
ON CONFLICT ("key") DO NOTHING;
