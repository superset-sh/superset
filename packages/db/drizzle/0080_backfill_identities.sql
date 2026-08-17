-- Seeds user_identities from two sources.
--
-- 1. GitHub sign-ins. auth.accounts.account_id for provider_id='github' is
--    GitHub's numeric user id, which is exactly what webhook payloads carry as
--    sender.id — so the people filter and `me` work without every member first
--    clicking connect in every organization.
--
--    Scoped to organizations that actually have a GitHub installation:
--    elsewhere no GitHub event can arrive, so the row would be noise. That is
--    ~2,029 rows rather than ~29,190.
--
--    handle is left null. The sign-in record has no login, and matching does
--    not need one — it fills in when a picker first fetches it.
INSERT INTO "user_identities" (
	"user_id",
	"organization_id",
	"provider",
	"external_id",
	"external_scope_id",
	"handle",
	"metadata"
)
SELECT DISTINCT
	a."user_id",
	m."organization_id",
	'github',
	a."account_id",
	NULL,
	NULL,
	-- Typed for the same reason as below: an untyped NULL is text, and the
	-- column is jsonb.
	NULL::jsonb
FROM "auth"."accounts" a
JOIN "auth"."members" m ON m."user_id" = a."user_id"
JOIN "github_installations" gi ON gi."organization_id" = m."organization_id"
WHERE a."provider_id" = 'github'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 2. Slack links, folded in from users__slack_users so there is one identity
--    shape rather than one table per provider.
--
--    team_id becomes external_scope_id: a Slack user id is only unique within
--    a workspace, unlike GitHub's.
--
--    model_preference moves into metadata rather than being dropped — it is a
--    live setting, shown on the Slack app home and used to pick the model on
--    every mention. Losing it would silently reset those users to the default.
--
--    The reading and writing code moves in the same change, so the copy cannot
--    drift from a source that is still being written. The old table is left in
--    place, unread, and dropped separately.
INSERT INTO "user_identities" (
	"user_id",
	"organization_id",
	"provider",
	"external_id",
	"external_scope_id",
	"handle",
	"metadata",
	"created_at"
)
SELECT
	s."user_id",
	s."organization_id",
	'slack',
	s."slack_user_id",
	s."team_id",
	NULL,
	CASE
		-- Typed: an untyped NULL makes the whole CASE text, which then clashes
		-- with the jsonb branch.
		WHEN s."model_preference" IS NULL THEN NULL::jsonb
		ELSE jsonb_build_object(
			'provider', 'slack',
			'modelPreference', s."model_preference"
		)
	END,
	s."created_at"
FROM "users__slack_users" s
ON CONFLICT DO NOTHING;
