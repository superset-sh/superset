DROP TABLE "chat_attachments" CASCADE;--> statement-breakpoint
ALTER TABLE "page_versions" RENAME COLUMN "blob_pathname" TO "storage_key";