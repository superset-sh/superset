CREATE TYPE "public"."leaderboard_visibility" AS ENUM('public', 'hidden');--> statement-breakpoint
CREATE TABLE "leaderboard_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"host_id" text NOT NULL,
	"uncached_input" bigint DEFAULT 0 NOT NULL,
	"cached_input" bigint DEFAULT 0 NOT NULL,
	"cache_write_5m" bigint DEFAULT 0 NOT NULL,
	"cache_write_1h" bigint DEFAULT 0 NOT NULL,
	"output" bigint DEFAULT 0 NOT NULL,
	"reasoning_output" bigint DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"usd_estimate" numeric(14, 6) DEFAULT '0' NOT NULL,
	"approximate" boolean DEFAULT false NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_daily_identity_key" UNIQUE("user_id","day","provider","model","host_id")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_daily_factory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"host_id" text NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"parallel_sessions" numeric(6, 2) DEFAULT '0' NOT NULL,
	"agent_prs_merged" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_daily_factory_identity_key" UNIQUE("user_id","day","host_id")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_participants" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"visibility" "leaderboard_visibility" DEFAULT 'public' NOT NULL,
	"organization_id" uuid,
	"opted_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"last_published_at" timestamp with time zone,
	"payload_version" integer DEFAULT 1 NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_participants_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_daily" ADD CONSTRAINT "leaderboard_daily_user_id_leaderboard_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."leaderboard_participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_daily_factory" ADD CONSTRAINT "leaderboard_daily_factory_user_id_leaderboard_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."leaderboard_participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_participants" ADD CONSTRAINT "leaderboard_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_participants" ADD CONSTRAINT "leaderboard_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leaderboard_daily_day_idx" ON "leaderboard_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "leaderboard_daily_user_day_idx" ON "leaderboard_daily" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "leaderboard_daily_model_day_idx" ON "leaderboard_daily" USING btree ("model","day");--> statement-breakpoint
CREATE INDEX "leaderboard_daily_factory_day_idx" ON "leaderboard_daily_factory" USING btree ("day");--> statement-breakpoint
CREATE INDEX "leaderboard_daily_factory_user_day_idx" ON "leaderboard_daily_factory" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "leaderboard_participants_tokens_idx" ON "leaderboard_participants" USING btree ("tokens");--> statement-breakpoint
CREATE INDEX "leaderboard_participants_org_idx" ON "leaderboard_participants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leaderboard_participants_usd_idx" ON "leaderboard_participants" USING btree ("usd");--> statement-breakpoint
CREATE INDEX "leaderboard_participants_tier_idx" ON "leaderboard_participants" USING btree ("tier");