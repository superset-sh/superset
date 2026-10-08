CREATE TYPE "public"."page_share_role" AS ENUM('view', 'comment');--> statement-breakpoint
ALTER TYPE "public"."cloud_workspace_activity_event" ADD VALUE 'shared';--> statement-breakpoint
ALTER TYPE "public"."cloud_workspace_activity_event" ADD VALUE 'unshared';--> statement-breakpoint
CREATE TABLE "cloud_workspace_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"invitation_id" uuid,
	"shared_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cloud_workspace_id" uuid NOT NULL,
	CONSTRAINT "cloud_workspace_shares_one_grantee" CHECK (num_nonnulls(user_id, team_id, invitation_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "page_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"invitation_id" uuid,
	"shared_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_id" uuid NOT NULL,
	"role" "page_share_role" DEFAULT 'comment' NOT NULL,
	CONSTRAINT "page_shares_one_grantee" CHECK (num_nonnulls(user_id, team_id, invitation_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD COLUMN "target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD COLUMN "target_team_id" uuid;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD COLUMN "target_email" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "organization_role" "page_share_role" DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_workspace_shares" ADD CONSTRAINT "cloud_workspace_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_shares" ADD CONSTRAINT "cloud_workspace_shares_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_shares" ADD CONSTRAINT "cloud_workspace_shares_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "auth"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_shares" ADD CONSTRAINT "cloud_workspace_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_shares" ADD CONSTRAINT "cloud_workspace_shares_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_shares" ADD CONSTRAINT "page_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_shares" ADD CONSTRAINT "page_shares_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_shares" ADD CONSTRAINT "page_shares_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "auth"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_shares" ADD CONSTRAINT "page_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_shares" ADD CONSTRAINT "page_shares_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_workspace_shares_user_unique" ON "cloud_workspace_shares" USING btree ("cloud_workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_workspace_shares_team_unique" ON "cloud_workspace_shares" USING btree ("cloud_workspace_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_workspace_shares_invitation_unique" ON "cloud_workspace_shares" USING btree ("cloud_workspace_id","invitation_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_shares_user_id_idx" ON "cloud_workspace_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_shares_team_id_idx" ON "cloud_workspace_shares" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_shares_invitation_id_idx" ON "cloud_workspace_shares" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_shares_shared_by_user_id_idx" ON "cloud_workspace_shares" USING btree ("shared_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_shares_user_unique" ON "page_shares" USING btree ("page_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_shares_team_unique" ON "page_shares" USING btree ("page_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_shares_invitation_unique" ON "page_shares" USING btree ("page_id","invitation_id");--> statement-breakpoint
CREATE INDEX "page_shares_user_id_idx" ON "page_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "page_shares_team_id_idx" ON "page_shares" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "page_shares_invitation_id_idx" ON "page_shares" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "page_shares_shared_by_user_id_idx" ON "page_shares" USING btree ("shared_by_user_id");--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_target_team_id_teams_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "auth"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_target_user_id_idx" ON "cloud_workspace_activity" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_target_team_id_idx" ON "cloud_workspace_activity" USING btree ("target_team_id");