-- Custom SQL migration file, put your code below! --

-- Scope unification: every people filter becomes a scope, and null scopes die.
-- For each trigger kind, rewrite its config's scope/actor fields:
--   null            -> {"mode":"any"}
--   "anyone"        -> {"mode":"any"}
--   "me"            -> {"mode":"any"}
--   {"ids":[...]}   -> {"mode":"list","ids":[...]}
-- Fields absent from a config (union members that never carried them) are left
-- absent. Each statement is idempotent: already-tagged values match no WHERE.

-- github: scopes repositories/branches/labels; people actor/subjectAuthor
UPDATE automation_triggers SET config = jsonb_set(config, '{repositories}', '{"mode":"any"}'::jsonb) WHERE kind = 'github' AND config->'repositories' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{branches}', '{"mode":"any"}'::jsonb) WHERE kind = 'github' AND config->'branches' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{labels}', '{"mode":"any"}'::jsonb) WHERE kind = 'github' AND config->'labels' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', '{"mode":"any"}'::jsonb) WHERE kind = 'github' AND config->'actor' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', jsonb_build_object('mode', 'list', 'ids', config->'actor'->'ids')) WHERE kind = 'github' AND jsonb_typeof(config->'actor') = 'object' AND NOT config->'actor' ? 'mode';--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{subjectAuthor}', '{"mode":"any"}'::jsonb) WHERE kind = 'github' AND config->'subjectAuthor' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{subjectAuthor}', jsonb_build_object('mode', 'list', 'ids', config->'subjectAuthor'->'ids')) WHERE kind = 'github' AND jsonb_typeof(config->'subjectAuthor') = 'object' AND NOT config->'subjectAuthor' ? 'mode';--> statement-breakpoint

-- slack: scopes channels/emoji; people actor
UPDATE automation_triggers SET config = jsonb_set(config, '{channels}', '{"mode":"any"}'::jsonb) WHERE kind = 'slack' AND config->'channels' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{emoji}', '{"mode":"any"}'::jsonb) WHERE kind = 'slack' AND config->'emoji' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', '{"mode":"any"}'::jsonb) WHERE kind = 'slack' AND config->'actor' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', jsonb_build_object('mode', 'list', 'ids', config->'actor'->'ids')) WHERE kind = 'slack' AND jsonb_typeof(config->'actor') = 'object' AND NOT config->'actor' ? 'mode';--> statement-breakpoint

-- linear: scopes teams/projects/labels/toStatus; people assignee
UPDATE automation_triggers SET config = jsonb_set(config, '{teams}', '{"mode":"any"}'::jsonb) WHERE kind = 'linear' AND config->'teams' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{projects}', '{"mode":"any"}'::jsonb) WHERE kind = 'linear' AND config->'projects' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{labels}', '{"mode":"any"}'::jsonb) WHERE kind = 'linear' AND config->'labels' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{toStatus}', '{"mode":"any"}'::jsonb) WHERE kind = 'linear' AND config->'toStatus' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{assignee}', '{"mode":"any"}'::jsonb) WHERE kind = 'linear' AND config->'assignee' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{assignee}', jsonb_build_object('mode', 'list', 'ids', config->'assignee'->'ids')) WHERE kind = 'linear' AND jsonb_typeof(config->'assignee') = 'object' AND NOT config->'assignee' ? 'mode';--> statement-breakpoint

-- sentry: scopes projects/level
UPDATE automation_triggers SET config = jsonb_set(config, '{projects}', '{"mode":"any"}'::jsonb) WHERE kind = 'sentry' AND config->'projects' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{level}', '{"mode":"any"}'::jsonb) WHERE kind = 'sentry' AND config->'level' = 'null'::jsonb;--> statement-breakpoint

-- circleback: scopes tags/attendees
UPDATE automation_triggers SET config = jsonb_set(config, '{tags}', '{"mode":"any"}'::jsonb) WHERE kind = 'circleback' AND config->'tags' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{attendees}', '{"mode":"any"}'::jsonb) WHERE kind = 'circleback' AND config->'attendees' = 'null'::jsonb;--> statement-breakpoint

-- notion: scopes dataSources/pages; people actor/mentionedUser
UPDATE automation_triggers SET config = jsonb_set(config, '{dataSources}', '{"mode":"any"}'::jsonb) WHERE kind = 'notion' AND config->'dataSources' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{pages}', '{"mode":"any"}'::jsonb) WHERE kind = 'notion' AND config->'pages' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', '{"mode":"any"}'::jsonb) WHERE kind = 'notion' AND config->'actor' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', jsonb_build_object('mode', 'list', 'ids', config->'actor'->'ids')) WHERE kind = 'notion' AND jsonb_typeof(config->'actor') = 'object' AND NOT config->'actor' ? 'mode';--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{mentionedUser}', '{"mode":"any"}'::jsonb) WHERE kind = 'notion' AND config->'mentionedUser' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{mentionedUser}', jsonb_build_object('mode', 'list', 'ids', config->'mentionedUser'->'ids')) WHERE kind = 'notion' AND jsonb_typeof(config->'mentionedUser') = 'object' AND NOT config->'mentionedUser' ? 'mode';--> statement-breakpoint

-- microsoft_teams: scopes teams/channels; people actor
UPDATE automation_triggers SET config = jsonb_set(config, '{teams}', '{"mode":"any"}'::jsonb) WHERE kind = 'microsoft_teams' AND config->'teams' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{channels}', '{"mode":"any"}'::jsonb) WHERE kind = 'microsoft_teams' AND config->'channels' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', '{"mode":"any"}'::jsonb) WHERE kind = 'microsoft_teams' AND config->'actor' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{actor}', jsonb_build_object('mode', 'list', 'ids', config->'actor'->'ids')) WHERE kind = 'microsoft_teams' AND jsonb_typeof(config->'actor') = 'object' AND NOT config->'actor' ? 'mode';--> statement-breakpoint

-- google_calendar: scope calendars; people attendee
UPDATE automation_triggers SET config = jsonb_set(config, '{calendars}', '{"mode":"any"}'::jsonb) WHERE kind = 'google_calendar' AND config->'calendars' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{attendee}', '{"mode":"any"}'::jsonb) WHERE kind = 'google_calendar' AND config->'attendee' IN ('null'::jsonb, '"anyone"'::jsonb, '"me"'::jsonb);--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{attendee}', jsonb_build_object('mode', 'list', 'ids', config->'attendee'->'ids')) WHERE kind = 'google_calendar' AND jsonb_typeof(config->'attendee') = 'object' AND NOT config->'attendee' ? 'mode';--> statement-breakpoint

-- gmail: scopes from/to/labels
UPDATE automation_triggers SET config = jsonb_set(config, '{from}', '{"mode":"any"}'::jsonb) WHERE kind = 'gmail' AND config->'from' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{to}', '{"mode":"any"}'::jsonb) WHERE kind = 'gmail' AND config->'to' = 'null'::jsonb;--> statement-breakpoint
UPDATE automation_triggers SET config = jsonb_set(config, '{labels}', '{"mode":"any"}'::jsonb) WHERE kind = 'gmail' AND config->'labels' = 'null'::jsonb;
