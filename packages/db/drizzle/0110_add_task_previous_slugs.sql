ALTER TABLE "tasks" ADD COLUMN "previous_slugs" text[] DEFAULT '{}' NOT NULL;
