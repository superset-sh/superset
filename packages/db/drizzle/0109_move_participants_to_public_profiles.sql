DO $$
DECLARE
	offenders text;
	offender_count bigint;
BEGIN
	SELECT count(*), string_agg(quote_literal("handle"), ', ' ORDER BY "handle")
	INTO offender_count, offenders
	FROM "leaderboard_participants"
	WHERE length("handle") NOT BETWEEN 2 AND 39
		OR "handle" !~ '^[a-z0-9]+(-[a-z0-9]+)*$';

	IF offender_count > 0 THEN
		RAISE EXCEPTION
			'Cannot migrate leaderboard_participants: % handle(s) violate the canonical handle grammar: %',
			offender_count, offenders
		USING HINT =
			'Reconcile these handles in leaderboard_participants before applying 0109.';
	END IF;
END $$;
--> statement-breakpoint

INSERT INTO "handles" ("handle", "owner_type", "user_id", "created_at", "updated_at")
SELECT "handle", 'user', "user_id", "opted_in_at", now()
FROM "leaderboard_participants"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "public_profiles" (
	"user_id", "handle", "visibility", "organization_id",
	"opted_in_at", "revoked_at", "flagged_at", "last_published_at",
	"payload_version",
	"tokens", "usd", "sessions",
	"uncached_input", "cached_input", "cache_write_5m", "cache_write_1h",
	"output", "reasoning_output",
	"approximate", "day_range_start", "day_range_end",
	"tier", "tier_computed_at", "active_days",
	"axis_width", "axis_depth", "axis_output", "axis_cost",
	"created_at", "updated_at"
)
SELECT
	"user_id", "handle", "visibility", "organization_id",
	"opted_in_at", "revoked_at", "flagged_at", "last_published_at",
	"payload_version",
	"tokens", "usd", "sessions",
	"uncached_input", "cached_input", "cache_write_5m", "cache_write_1h",
	"output", "reasoning_output",
	"approximate", "day_range_start", "day_range_end",
	"tier", "tier_computed_at", "active_days",
	"axis_width", "axis_depth", "axis_output", "axis_cost",
	"created_at", "updated_at"
FROM "leaderboard_participants"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

DO $$
DECLARE
	missing_handles bigint;
	missing_profiles bigint;
	stale_profiles bigint;
	orphan_daily bigint;
	orphan_factory bigint;
BEGIN
	SELECT count(*) INTO missing_handles
	FROM "leaderboard_participants" p
	WHERE NOT EXISTS (
		SELECT 1 FROM "handles" h
		WHERE h."handle" = p."handle" AND h."user_id" = p."user_id"
	);

	SELECT count(*) INTO missing_profiles
	FROM "leaderboard_participants" p
	WHERE NOT EXISTS (
		SELECT 1 FROM "public_profiles" pp WHERE pp."user_id" = p."user_id"
	);

	SELECT count(*) INTO stale_profiles
	FROM "leaderboard_participants" p
	JOIN "public_profiles" pp ON pp."user_id" = p."user_id"
	WHERE (p."handle", p."visibility", p."organization_id",
		p."opted_in_at", p."revoked_at", p."flagged_at",
		p."last_published_at", p."payload_version", p."tokens",
		p."usd", p."sessions", p."uncached_input", p."cached_input",
		p."cache_write_5m", p."cache_write_1h", p."output",
		p."reasoning_output", p."approximate", p."day_range_start",
		p."day_range_end", p."tier", p."tier_computed_at",
		p."active_days", p."axis_width", p."axis_depth",
		p."axis_output", p."axis_cost")
		IS DISTINCT FROM
		(pp."handle", pp."visibility", pp."organization_id",
		pp."opted_in_at", pp."revoked_at", pp."flagged_at",
		pp."last_published_at", pp."payload_version", pp."tokens",
		pp."usd", pp."sessions", pp."uncached_input", pp."cached_input",
		pp."cache_write_5m", pp."cache_write_1h", pp."output",
		pp."reasoning_output", pp."approximate", pp."day_range_start",
		pp."day_range_end", pp."tier", pp."tier_computed_at",
		pp."active_days", pp."axis_width", pp."axis_depth",
		pp."axis_output", pp."axis_cost");

	SELECT count(*) INTO orphan_daily
	FROM "leaderboard_daily" d
	WHERE NOT EXISTS (
		SELECT 1 FROM "public_profiles" pp WHERE pp."user_id" = d."user_id"
	);

	SELECT count(*) INTO orphan_factory
	FROM "leaderboard_daily_factory" f
	WHERE NOT EXISTS (
		SELECT 1 FROM "public_profiles" pp WHERE pp."user_id" = f."user_id"
	);

	IF missing_handles > 0 OR missing_profiles > 0 OR stale_profiles > 0
		OR orphan_daily > 0 OR orphan_factory > 0 THEN
		RAISE EXCEPTION
			'Participant copy incomplete: % handle(s) and % profile(s) not copied, % profile(s) disagree with their participant row, leaving % leaderboard_daily and % leaderboard_daily_factory row(s) orphaned',
			missing_handles, missing_profiles, stale_profiles, orphan_daily, orphan_factory
		USING HINT =
			'A handle, user_id or profile row already existed with different data; reconcile it and re-run.';
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "leaderboard_daily" DROP CONSTRAINT "leaderboard_daily_user_id_leaderboard_participants_user_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_daily_factory" DROP CONSTRAINT "leaderboard_daily_factory_user_id_leaderboard_participants_user_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_daily" ADD CONSTRAINT "leaderboard_daily_user_id_public_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."public_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_daily_factory" ADD CONSTRAINT "leaderboard_daily_factory_user_id_public_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."public_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
