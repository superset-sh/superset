-- Blaxel is gone as a provider: every sandbox it hosted is unreachable, so the
-- workspaces that ran there are failed rather than ready, and the environments
-- that forked from its goldens are archived. The shared image environment keeps
-- its name (the same repository exists in Vercel Container Registry) and moves
-- to the new provider. `sandbox:release` recreates the internal fork environment.
UPDATE "cloud_workspaces" SET "status" = 'failed', "sandbox_url" = NULL WHERE "provider" = 'blaxel' AND "status" IN ('ready', 'provisioning');--> statement-breakpoint
UPDATE "environments" SET "archived_at" = now() WHERE "provider" = 'blaxel' AND "source_kind" = 'fork' AND "archived_at" IS NULL;--> statement-breakpoint
UPDATE "environments" SET "provider" = 'vercel' WHERE "provider" = 'blaxel' AND "source_kind" = 'image';
