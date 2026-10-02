-- Hand-written in place of drizzle-kit's text cast + DROP/CREATE TYPE, which rewrites
-- `attachments` and fails on rows still holding the old value. Same end state.
ALTER TYPE "public"."attachment_parent_kind" RENAME VALUE 'cloud_workspace_prompt' TO 'cloud_workspace';
