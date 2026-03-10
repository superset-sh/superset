CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'partial_refund', 'fraudulent');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_desk_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"worktree_path" text,
	"branch_name" varchar(200),
	"pr_url" text,
	"pr_number" integer,
	"status" "agent_desk_execution_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"log" text
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."payment_order_status";--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "status" SET DATA TYPE "public"."payment_order_status" USING "status"::"public"."payment_order_status";--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "analysis_result" jsonb;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "spec" text;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "agent_desk_executions" ADD CONSTRAINT "agent_desk_executions_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;