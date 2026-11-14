-- Some posts were saved with a listing's button text ("Read", "Read more") as their title.
UPDATE "item" SET "title" = 'Vanta to Acquire Pillar Security'
  WHERE "url" LIKE '%pillar.security/blog/vanta-to-acquire-pillar-security%';
--> statement-breakpoint
UPDATE "item" SET "title" = initcap(replace(regexp_replace("url", '^.*/([^/?#]+)/?([?#].*)?$', '\1'), '-', ' '))
  WHERE "kind" = 'post' AND lower(trim(coalesce("title", ''))) ~ '^(read|read more|read article|read post|read story|learn more|more|continue reading|view|view post|see more|details)?[ →›»]*$';
