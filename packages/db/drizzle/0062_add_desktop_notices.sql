CREATE TYPE "public"."desktop_notice_cta_action" AS ENUM('install-update', 'open-url');--> statement-breakpoint
CREATE TYPE "public"."desktop_notice_severity" AS ENUM('info', 'warning', 'blocking');--> statement-breakpoint
CREATE TYPE "public"."desktop_notice_trigger" AS ENUM('immediate', 'pre-update', 'post-update');--> statement-breakpoint
CREATE TABLE "desktop_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" "desktop_notice_severity" NOT NULL,
	"trigger" "desktop_notice_trigger" DEFAULT 'immediate' NOT NULL,
	"min_version" text,
	"max_version" text,
	"platforms" text[],
	"channels" text[],
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_action" "desktop_notice_cta_action",
	"cta_url" text,
	"dismissible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "desktop_notices_active_idx" ON "desktop_notices" USING btree ("active");