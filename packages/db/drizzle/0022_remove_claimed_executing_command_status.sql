ALTER TABLE "agent_commands" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
UPDATE "agent_commands" SET "status" = 'timeout' WHERE "status" IN ('claimed', 'executing');--> statement-breakpoint
DROP TYPE "public"."command_status";--> statement-breakpoint
CREATE TYPE "public"."command_status" AS ENUM('pending', 'completed', 'failed', 'timeout');--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."command_status";--> statement-breakpoint
ALTER TABLE "agent_commands" ALTER COLUMN "status" SET DATA TYPE "public"."command_status" USING "status"::"public"."command_status";--> statement-breakpoint
ALTER TABLE "agent_commands" DROP COLUMN "claimed_by";--> statement-breakpoint
ALTER TABLE "agent_commands" DROP COLUMN "claimed_at";