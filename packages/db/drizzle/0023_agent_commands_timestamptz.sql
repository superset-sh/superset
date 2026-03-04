ALTER TABLE "agent_commands" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "executed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "timeout_at" SET DATA TYPE timestamp with time zone;