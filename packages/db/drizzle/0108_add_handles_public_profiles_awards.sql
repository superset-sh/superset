CREATE TYPE "public"."handle_owner_type" AS ENUM('user', 'organization', 'reserved');--> statement-breakpoint
CREATE TABLE "handles" (
	"handle" text PRIMARY KEY NOT NULL,
	"owner_type" "handle_owner_type" NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handles_user_key" UNIQUE("user_id"),
	CONSTRAINT "handles_organization_key" UNIQUE("organization_id"),
	CONSTRAINT "handles_user_owner_key" UNIQUE("handle","user_id"),
	CONSTRAINT "handles_owner_matches_type" CHECK ((
				("handles"."owner_type" = 'user' and "handles"."user_id" is not null and "handles"."organization_id" is null)
				or ("handles"."owner_type" = 'organization' and "handles"."organization_id" is not null and "handles"."user_id" is null)
				or ("handles"."owner_type" = 'reserved' and "handles"."user_id" is null and "handles"."organization_id" is null)
			)),
	CONSTRAINT "handles_shape" CHECK (length("handles"."handle") between 2 and 39 and "handles"."handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "profile_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"tier" integer DEFAULT 0 NOT NULL,
	"value" numeric(20, 4) DEFAULT '0' NOT NULL,
	"awarded_on" date NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_awards_identity_key" UNIQUE("user_id","slug","tier")
);
--> statement-breakpoint
CREATE TABLE "public_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"visibility" "leaderboard_visibility" DEFAULT 'public' NOT NULL,
	"bio" text,
	"github_handle" text,
	"x_handle" text,
	"website_url" text,
	"organization_id" uuid,
	"opted_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"last_published_at" timestamp with time zone,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"awards_catalog_version" integer DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"uncached_input" bigint DEFAULT 0 NOT NULL,
	"cached_input" bigint DEFAULT 0 NOT NULL,
	"cache_write_5m" bigint DEFAULT 0 NOT NULL,
	"cache_write_1h" bigint DEFAULT 0 NOT NULL,
	"output" bigint DEFAULT 0 NOT NULL,
	"reasoning_output" bigint DEFAULT 0 NOT NULL,
	"approximate" boolean DEFAULT false NOT NULL,
	"day_range_start" date,
	"day_range_end" date,
	"tier" integer DEFAULT 0 NOT NULL,
	"tier_computed_at" timestamp with time zone,
	"active_days" integer DEFAULT 0 NOT NULL,
	"axis_width" numeric(6, 2) DEFAULT '0' NOT NULL,
	"axis_depth" bigint DEFAULT 0 NOT NULL,
	"axis_output" numeric(8, 2) DEFAULT '0' NOT NULL,
	"axis_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "public_profiles_bio_length" CHECK (length("public_profiles"."bio") <= 160),
	CONSTRAINT "public_profiles_website_scheme" CHECK ("public_profiles"."website_url" is null or "public_profiles"."website_url" ~ '^https://')
);
--> statement-breakpoint
ALTER TABLE "handles" ADD CONSTRAINT "handles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handles" ADD CONSTRAINT "handles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_awards" ADD CONSTRAINT "profile_awards_user_id_public_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."public_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_profiles" ADD CONSTRAINT "public_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_profiles" ADD CONSTRAINT "public_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_profiles" ADD CONSTRAINT "public_profiles_handle_owner_fk" FOREIGN KEY ("handle","user_id") REFERENCES "public"."handles"("handle","user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "handles_owner_type_idx" ON "handles" USING btree ("owner_type");--> statement-breakpoint
CREATE INDEX "profile_awards_user_idx" ON "profile_awards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_awards_slug_idx" ON "profile_awards" USING btree ("slug","awarded_at");--> statement-breakpoint
CREATE INDEX "public_profiles_tokens_idx" ON "public_profiles" USING btree ("tokens");--> statement-breakpoint
CREATE INDEX "public_profiles_org_idx" ON "public_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "public_profiles_usd_idx" ON "public_profiles" USING btree ("usd");--> statement-breakpoint
CREATE INDEX "public_profiles_tier_idx" ON "public_profiles" USING btree ("tier");