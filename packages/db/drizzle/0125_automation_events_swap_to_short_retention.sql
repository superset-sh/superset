-- Replaces automation_events with an empty table of the same shape, carrying
-- over only what is still read, and drops the old one.
--
-- The table reached 67M rows and 299 GB with nothing ever deleting a row; the
-- pruner only nulls bodies, which returns no space. Retention (48 h, same as
-- ingest.webhook_events) joins in the same release, and the indexes it needs
-- are created here on the empty table, where they cost nothing — on the old
-- one each was a locked build over 299 GB.
--
-- What is carried over: the last hour of rows, so a redelivery in that window
-- still conflicts on the dedup unique (Gmail's history re-walk and Sentry's and
-- Teams' retries all land within minutes; Linear, GitHub, Notion and Slack are
-- deduped a layer earlier, in ingest.webhook_events). Only the last fifteen
-- minutes keep their body: that is what a run still being dispatched reads
-- (packages/trpc dispatch), and nothing reads a body once the row is
-- dispatched. Rows still awaiting dispatch are inside that hour: the sweep had
-- zero older than that when this was written. Everything else is dedup history
-- for redeliveries that have already stopped, or audit rows nothing reads.
--
-- Lock order matters here. The sweep holds a transaction on this table for up
-- to a minute, so the migration first takes its advisory lock — waiting lets a
-- running batch finish without queueing anything, and holding it makes the
-- next batch skip. The bulk copies then run with no
-- table lock at all, so inserts continue. Only the delta of rows that arrived
-- during the copy, the drop and the renames run under ACCESS EXCLUSIVE, which
-- measured about a second at production size. The drop also has to remove the
-- foreign key to auth.organizations, so it takes that table's lock last, after
-- this one — the same order an insert takes them, so it cannot deadlock one.

CREATE TABLE "automation_events_swap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_connection_id" uuid,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"external_event_id" text NOT NULL,
	"resource_key" text,
	"title" text NOT NULL,
	"url" text,
	"repository_id" text,
	"ref" text,
	"actor_login" text,
	"actor_is_external" boolean,
	"payload" jsonb,
	"webhook_event_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_input" jsonb,
	"dispatched_at" timestamp with time zone,
	CONSTRAINT "automation_events_swap_dedup_unique" UNIQUE NULLS NOT DISTINCT ("integration_connection_id", "provider", "external_event_id")
);--> statement-breakpoint
ALTER TABLE "automation_events_swap" ADD CONSTRAINT "automation_events_swap_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_events_swap_undispatched_idx" ON "automation_events_swap" USING btree ("received_at") WHERE "dispatched_at" IS NULL;--> statement-breakpoint
CREATE INDEX "automation_events_swap_org_received_idx" ON "automation_events_swap" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "automation_events_swap_resource_idx" ON "automation_events_swap" USING btree ("resource_key");--> statement-breakpoint
CREATE INDEX "automation_events_swap_received_at_idx" ON "automation_events_swap" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "automation_runs_event_idx" ON "automation_runs" USING btree ("event_id");--> statement-breakpoint

-- The key is the one apps/api/src/lib/singleFlight.ts derives for
-- "automations.redispatch". A sweep has measured up to ten minutes; both
-- timeouts return to the migrate step's own values straight after.
SET LOCAL statement_timeout = '11min';--> statement-breakpoint
SET LOCAL lock_timeout = '11min';--> statement-breakpoint
SELECT pg_advisory_xact_lock(hashtextextended('job:automations.redispatch', 0));--> statement-breakpoint
SET LOCAL statement_timeout TO DEFAULT;--> statement-breakpoint
SET LOCAL lock_timeout TO DEFAULT;--> statement-breakpoint

-- now() is the transaction's start for every statement in this file, so these
-- bounds do not move while the copy runs.
INSERT INTO "automation_events_swap"
SELECT "id", "organization_id", "integration_connection_id", "provider", "event_type", "external_event_id", "resource_key", "title", "url", "repository_id", "ref", "actor_login", "actor_is_external",
	CASE WHEN "received_at" > now() - interval '15 minutes' THEN "payload" END,
	"webhook_event_id", "received_at", "dispatch_input", "dispatched_at"
FROM "automation_events"
WHERE "received_at" > now() - interval '60 minutes' AND "payload" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

LOCK TABLE "automation_events" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
-- Rows recorded since this transaction began: received_at defaults to their
-- own transaction's start, which is later than ours.
INSERT INTO "automation_events_swap" SELECT * FROM "automation_events" WHERE "received_at" > now() AND "payload" IS NOT NULL ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- CASCADE is for automation_runs' foreign key; it is put back below.
DROP TABLE "automation_events" CASCADE;--> statement-breakpoint

ALTER TABLE "automation_events_swap" RENAME TO "automation_events";--> statement-breakpoint
ALTER INDEX "automation_events_swap_pkey" RENAME TO "automation_events_pkey";--> statement-breakpoint
ALTER INDEX "automation_events_swap_undispatched_idx" RENAME TO "automation_events_undispatched_idx";--> statement-breakpoint
ALTER INDEX "automation_events_swap_org_received_idx" RENAME TO "automation_events_org_received_idx";--> statement-breakpoint
ALTER INDEX "automation_events_swap_resource_idx" RENAME TO "automation_events_resource_idx";--> statement-breakpoint
ALTER INDEX "automation_events_swap_received_at_idx" RENAME TO "automation_events_received_at_idx";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_dedup_unique" TO "automation_events_dedup_unique";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_organization_id_organizations_id_fk" TO "automation_events_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_id_not_null" TO "automation_events_id_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_organization_id_not_null" TO "automation_events_organization_id_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_provider_not_null" TO "automation_events_provider_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_event_type_not_null" TO "automation_events_event_type_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_external_event_id_not_null" TO "automation_events_external_event_id_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_title_not_null" TO "automation_events_title_not_null";--> statement-breakpoint
ALTER TABLE "automation_events" RENAME CONSTRAINT "automation_events_swap_received_at_not_null" TO "automation_events_received_at_not_null";--> statement-breakpoint

-- What ON DELETE SET NULL would have done for the rows that were not carried.
UPDATE "automation_runs" SET "event_id" = NULL WHERE "event_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "automation_events" e WHERE e."id" = "automation_runs"."event_id");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE set null ON UPDATE no action;
