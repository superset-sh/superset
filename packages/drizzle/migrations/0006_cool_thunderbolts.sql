CREATE TYPE "public"."ai_image_format" AS ENUM('feed', 'carousel', 'story', 'reels_cover');--> statement-breakpoint
CREATE TYPE "public"."ai_image_generation_status" AS ENUM('pending', 'generating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_image_style_category" AS ENUM('instagram', 'thumbnail', 'banner');--> statement-breakpoint
CREATE TABLE "ai_image_content_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"prompt_template" text NOT NULL,
	"recommended_style_ids" uuid[],
	"recommended_format" "ai_image_format",
	"thumbnail_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_image_content_themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_image_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"format" "ai_image_format" DEFAULT 'feed' NOT NULL,
	"style_template_id" uuid,
	"content_theme_id" uuid,
	"input_image_url" text,
	"output_image_url" text,
	"status" "ai_image_generation_status" DEFAULT 'pending' NOT NULL,
	"width" integer DEFAULT 1080 NOT NULL,
	"height" integer DEFAULT 1080 NOT NULL,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_image_style_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"prompt_suffix" text NOT NULL,
	"category" "ai_image_style_category" NOT NULL,
	"thumbnail_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_image_style_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_style_template_id_ai_image_style_templates_id_fk" FOREIGN KEY ("style_template_id") REFERENCES "public"."ai_image_style_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_content_theme_id_ai_image_content_themes_id_fk" FOREIGN KEY ("content_theme_id") REFERENCES "public"."ai_image_content_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_image_generations_user" ON "ai_image_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_image_generations_status" ON "ai_image_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_image_generations_format" ON "ai_image_generations" USING btree ("format");