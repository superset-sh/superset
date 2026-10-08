ALTER TABLE "tasks" ALTER COLUMN "team_id" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "number" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_number_unique" UNIQUE("team_id","number");