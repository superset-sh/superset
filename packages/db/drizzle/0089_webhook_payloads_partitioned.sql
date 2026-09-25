-- Webhook bodies, split out of ingest.webhook_events and partitioned by day.
--
-- Drizzle has no syntax for PARTITION BY, so this is a custom migration rather
-- than a generated one. The table is deliberately absent from the drizzle
-- schema: application code only ever writes it, never reads it back.

CREATE TABLE "ingest"."webhook_payloads" (
	"webhook_event_id" uuid NOT NULL,
	"received_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "webhook_payloads_pkey" PRIMARY KEY ("webhook_event_id", "received_at")
) PARTITION BY RANGE ("received_at");
--> statement-breakpoint

-- Availability net. Without it, an insert for a day with no partition fails
-- outright, which on the webhook path means 500s and eventual event loss once
-- a provider stops retrying. Rows landing here mean maintenance has stalled;
-- alert on it being non-empty, because a partition cannot be created over a
-- range this table already holds rows for until they are drained.
CREATE TABLE "ingest"."webhook_payloads_default"
	PARTITION OF "ingest"."webhook_payloads" DEFAULT;
--> statement-breakpoint

-- Creates partitions ahead of time and drops those past retention. Dropping is
-- the entire point: it returns the space immediately, where a DELETE leaves
-- dead tuples that only a rewrite reclaims.
CREATE OR REPLACE FUNCTION "ingest"."maintain_webhook_payload_partitions"(
	days_ahead integer DEFAULT 14,
	retain_days integer DEFAULT 7
) RETURNS TABLE(action text, partition_name text)
LANGUAGE plpgsql AS $$
DECLARE
	d date;
	nm text;
BEGIN
	FOR d IN
		SELECT generate_series(current_date, current_date + days_ahead, '1 day')::date
	LOOP
		nm := 'webhook_payloads_' || to_char(d, 'YYYYMMDD');
		IF NOT EXISTS (
			SELECT 1 FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'ingest' AND c.relname = nm
		) THEN
			EXECUTE format(
				'CREATE TABLE ingest.%I PARTITION OF ingest.webhook_payloads FOR VALUES FROM (%L) TO (%L)',
				nm, d, d + 1
			);
			action := 'created'; partition_name := nm; RETURN NEXT;
		END IF;
	END LOOP;

	FOR nm IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'ingest'
		  AND c.relname ~ '^webhook_payloads_[0-9]{8}$'
		  AND to_date(right(c.relname, 8), 'YYYYMMDD') < current_date - retain_days
	LOOP
		EXECUTE format('DROP TABLE ingest.%I', nm);
		action := 'dropped'; partition_name := nm; RETURN NEXT;
	END LOOP;
END $$;
--> statement-breakpoint

-- Seed the runway so the first inserts after deploy have somewhere to land.
SELECT * FROM "ingest"."maintain_webhook_payload_partitions"();
