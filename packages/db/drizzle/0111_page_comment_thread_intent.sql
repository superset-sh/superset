CREATE TYPE "public"."page_comment_intent" AS ENUM('delete', 'approve');--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD COLUMN "intent" "page_comment_intent";