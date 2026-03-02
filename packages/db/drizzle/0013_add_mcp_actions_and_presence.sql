CREATE TYPE "public"."command_status" AS ENUM('pending', 'claimed', 'executing', 'completed', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('desktop', 'mobile', 'web');--> statement-breakpoint
CREATE TABLE "agent_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_device_id" text,
	"target_device_type" text,
	"tool" text NOT NULL,
	"params" jsonb,
	"parent_command_id" uuid,
	"status" "command_status" DEFAULT 'pending' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp,
	"result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"executed_at" timestamp,
	"timeout_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"default_device_id" text,
	"last_used_at" timestamp,
	"usage_count" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "device_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"device_type" "device_type" NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_presence" ADD CONSTRAINT "device_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_presence" ADD CONSTRAINT "device_presence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_commands_user_status_idx" ON "agent_commands" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_commands_target_device_status_idx" ON "agent_commands" USING btree ("target_device_id","status");--> statement-breakpoint
CREATE INDEX "agent_commands_org_created_idx" ON "agent_commands" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_org_idx" ON "api_keys" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "device_presence_user_org_idx" ON "device_presence" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_presence_user_device_idx" ON "device_presence" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "device_presence_last_seen_idx" ON "device_presence" USING btree ("last_seen_at");