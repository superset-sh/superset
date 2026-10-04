-- Hand-edited: drizzle-kit drops and recreates the enum, which fails on existing 'deleted' rows.
ALTER TABLE "cloud_workspaces" RENAME COLUMN "deleted_at" TO "archived_at";--> statement-breakpoint
ALTER TYPE "public"."cloud_workspace_status" RENAME VALUE 'deleted' TO 'archived';
