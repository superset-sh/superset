CREATE TYPE "public"."page_report_reason" AS ENUM('malware_or_phishing', 'spam_or_scam', 'impersonation', 'sexual_content', 'violence_or_harassment', 'illegal_content', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "public"."page_report_status" AS ENUM('open', 'upheld', 'dismissed');--> statement-breakpoint
CREATE TABLE "page_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"reported_version" integer,
	"reason" "page_report_reason" NOT NULL,
	"details" text,
	"status" "page_report_status" DEFAULT 'open' NOT NULL,
	"reported_by_user_id" uuid,
	"reporter_email" text,
	"reporter_ip_hash" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "taken_down_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "taken_down_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "taken_down_note" text;--> statement-breakpoint
ALTER TABLE "page_reports" ADD CONSTRAINT "page_reports_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_reports" ADD CONSTRAINT "page_reports_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_reports" ADD CONSTRAINT "page_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_reports_status_created_at_idx" ON "page_reports" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "page_reports_page_id_idx" ON "page_reports" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_reports_reporter_ip_hash_idx" ON "page_reports" USING btree ("reporter_ip_hash");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_taken_down_by_user_id_users_id_fk" FOREIGN KEY ("taken_down_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;