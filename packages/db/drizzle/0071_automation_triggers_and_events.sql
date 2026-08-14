CREATE TYPE "public"."automation_trigger_kind" AS ENUM('schedule', 'webhook', 'github', 'slack', 'linear', 'sentry');--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'debounced';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "automation_events" (
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
	"payload" jsonb NOT NULL,
	"webhook_event_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_events_dedup_unique" UNIQUE NULLS NOT DISTINCT("integration_connection_id","provider","external_event_id")
);
--> statement-breakpoint
CREATE TABLE "automation_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "automation_trigger_kind" NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"secret_hash" text,
	"secret_prefix" text,
	"secret_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_triggers_kind_matches_config" CHECK (config->>'kind' = kind::text)
);
--> statement-breakpoint
ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_automation_id_automations_id_fk";
--> statement-breakpoint
DROP INDEX "automation_runs_dedup_idx";--> statement-breakpoint
ALTER TABLE "automation_runs" ALTER COLUMN "scheduled_for" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "trigger_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "resource_key" text;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_automation_org_fk" FOREIGN KEY ("automation_id","organization_id") REFERENCES "public"."automations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_events_org_received_idx" ON "automation_events" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "automation_events_resource_idx" ON "automation_events" USING btree ("resource_key");--> statement-breakpoint
CREATE INDEX "automation_triggers_dispatcher_idx" ON "automation_triggers" USING btree ("enabled","next_run_at") WHERE kind = 'schedule';--> statement-breakpoint
CREATE INDEX "automation_triggers_matcher_idx" ON "automation_triggers" USING btree ("organization_id","kind") WHERE enabled;--> statement-breakpoint
CREATE INDEX "automation_triggers_automation_idx" ON "automation_triggers" USING btree ("automation_id");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_trigger_id_automation_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."automation_triggers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_org_fk" FOREIGN KEY ("automation_id","organization_id") REFERENCES "public"."automations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_schedule_dedup_idx" ON "automation_runs" USING btree ("automation_id","scheduled_for") WHERE scheduled_for IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_event_dedup_idx" ON "automation_runs" USING btree ("trigger_id","event_id") WHERE event_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "automation_runs_inflight_resource_idx" ON "automation_runs" USING btree ("trigger_id","resource_key") WHERE status IN ('dispatching', 'dispatched');