ALTER TYPE "public"."booking_provider_status" ADD VALUE 'pending_review' BEFORE 'active';--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "studio_content_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_id" uuid NOT NULL,
	"seo_score" integer DEFAULT 0 NOT NULL,
	"aeo_score" integer DEFAULT 0 NOT NULL,
	"geo_score" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"seo_details" jsonb NOT NULL,
	"aeo_details" jsonb NOT NULL,
	"geo_details" jsonb NOT NULL,
	"analysis_version" varchar(10) DEFAULT '1.0',
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_content_analysis" ADD CONSTRAINT "studio_content_analysis_content_id_studio_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."studio_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_studio_content_analysis_content" ON "studio_content_analysis" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_studio_content_analysis_snapshot" ON "studio_content_analysis" USING btree ("snapshot_at");