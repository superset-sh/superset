ALTER TABLE "auth"."members" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "auth"."organizations" ALTER COLUMN "created_at" SET DEFAULT now();