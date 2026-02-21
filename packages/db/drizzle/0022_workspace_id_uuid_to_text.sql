ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "workspace_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
