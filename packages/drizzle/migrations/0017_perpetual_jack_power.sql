CREATE TYPE "public"."catalog_group" AS ENUM('core', 'content', 'commerce', 'system');--> statement-breakpoint
CREATE TYPE "public"."catalog_dependency_type" AS ENUM('required', 'recommended', 'optional');--> statement-breakpoint
CREATE TABLE "catalog_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	"dependency_type" "catalog_dependency_type" DEFAULT 'required' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"group" "catalog_group" DEFAULT 'content' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"preview_images" jsonb DEFAULT '[]'::jsonb,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"tech_stack" jsonb,
	"is_core" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_features_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "catalog_dependencies" ADD CONSTRAINT "catalog_dependencies_feature_id_catalog_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."catalog_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_dependencies" ADD CONSTRAINT "catalog_dependencies_depends_on_id_catalog_features_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."catalog_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_catalog_dep" ON "catalog_dependencies" USING btree ("feature_id","depends_on_id");