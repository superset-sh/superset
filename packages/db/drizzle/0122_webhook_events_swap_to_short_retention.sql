-- Custom SQL migration file, put your code below! --

-- Replaces ingest.webhook_events with an empty table of the same shape and
-- drops the old one.
--
-- The table reached 210M rows and 540 GB because deletion could never keep up
-- with intake: every row deleted costs four random index touches across 42 GB
-- of indexes against a 6 GB cache, which measured 126 s per 5,000 rows in
-- production. At that rate draining the backlog takes about eight weeks while
-- 4.6M rows a day keep arriving, so it never converges. Retention drops to two
-- days in the same change, and the rows past that are dropped with the table
-- rather than deleted out of it. Dropping is also the only way to return the
-- 424 GB of dead TOAST the removed payload column left behind.
--
-- Nothing references this table by foreign key, and no code reads the old rows:
-- dedup is only ever checked against the live table, and automations have
-- their own on automation_events (integration_connection_id, provider,
-- external_event_id), which this does not touch. The last fifteen minutes are
-- carried over so that deliveries still in flight through QStash find their
-- row. Recovery, if it is ever wanted, is a Neon branch from before this ran.
CREATE TABLE "ingest"."webhook_events_swap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_swap_provider_event_id_idx" ON "ingest"."webhook_events_swap" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_swap_provider_status_idx" ON "ingest"."webhook_events_swap" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "webhook_events_swap_received_at_idx" ON "ingest"."webhook_events_swap" USING btree ("received_at");--> statement-breakpoint

-- The retention job holds a transaction open on this table for minutes at a
-- time, one delete batch after another, so a table lock requested while it runs
-- waits out the production lock_timeout on every retry — and while it waits,
-- every webhook insert queues behind it. Waiting on the job's own advisory lock
-- instead lets its current batch finish without queueing anything on the
-- table, and holding it until commit makes the job's next batch skip. The key
-- is the one apps/api/src/lib/singleFlight.ts derives for that job.
--
-- A batch has measured up to ten minutes, which is what the wait is bounded by;
-- both timeouts go back to the migrate step's own values straight after.
SET LOCAL statement_timeout = '11min';--> statement-breakpoint
SET LOCAL lock_timeout = '11min';--> statement-breakpoint
SELECT pg_advisory_xact_lock(hashtextextended('job:ingest.enforce-retention.webhook_events', 0));--> statement-breakpoint
SET LOCAL statement_timeout TO DEFAULT;--> statement-breakpoint
SET LOCAL lock_timeout TO DEFAULT;--> statement-breakpoint

-- Taken before the copy, not by the DROP after it: anything recorded between a
-- copy and a later lock would land in the table being dropped and be lost.
LOCK TABLE "ingest"."webhook_events" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint

INSERT INTO "ingest"."webhook_events_swap"
	("id", "provider", "event_id", "event_type", "status", "processed_at", "error", "retry_count", "received_at")
SELECT "id", "provider", "event_id", "event_type", "status", "processed_at", "error", "retry_count", "received_at"
FROM "ingest"."webhook_events"
WHERE "received_at" > now() - interval '15 minutes';--> statement-breakpoint

DROP TABLE "ingest"."webhook_events";--> statement-breakpoint

ALTER TABLE "ingest"."webhook_events_swap" RENAME TO "webhook_events";--> statement-breakpoint
ALTER INDEX "ingest"."webhook_events_swap_pkey" RENAME TO "webhook_events_pkey";--> statement-breakpoint
ALTER INDEX "ingest"."webhook_events_swap_provider_event_id_idx" RENAME TO "webhook_events_provider_event_id_idx";--> statement-breakpoint
ALTER INDEX "ingest"."webhook_events_swap_provider_status_idx" RENAME TO "webhook_events_provider_status_idx";--> statement-breakpoint
ALTER INDEX "ingest"."webhook_events_swap_received_at_idx" RENAME TO "webhook_events_received_at_idx";--> statement-breakpoint

-- Postgres names a not-null constraint after the table it was created on, so
-- without these the table keeps "_swap_" in six constraint names and stops
-- matching what a fresh CREATE TABLE from the schema builds.
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_id_not_null" TO "webhook_events_id_not_null";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_provider_not_null" TO "webhook_events_provider_not_null";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_event_id_not_null" TO "webhook_events_event_id_not_null";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_status_not_null" TO "webhook_events_status_not_null";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_retry_count_not_null" TO "webhook_events_retry_count_not_null";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" RENAME CONSTRAINT "webhook_events_swap_received_at_not_null" TO "webhook_events_received_at_not_null";
