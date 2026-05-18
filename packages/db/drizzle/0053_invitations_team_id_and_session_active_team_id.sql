ALTER TABLE "auth"."invitations" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD COLUMN "active_team_id" uuid;--> statement-breakpoint
ALTER TABLE "auth"."invitations" ADD CONSTRAINT "invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE set null ON UPDATE no action;