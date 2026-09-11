CREATE TYPE "public"."agent_credential_kind" AS ENUM('subscription', 'api_key');--> statement-breakpoint
CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"kind" "agent_credential_kind" NOT NULL,
	"encrypted_value" text NOT NULL,
	"base_url" text,
	"provider" text,
	"account_label" text,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_credentials_user_id_agent_unique" UNIQUE("user_id","agent")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ALTER COLUMN "provider" SET DEFAULT 'vercel';--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "provider" SET DEFAULT 'vercel';--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_credentials_user_id_idx" ON "agent_credentials" USING btree ("user_id");