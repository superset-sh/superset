-- Add team_id to auth.invitations so BetterAuth's organization plugin
-- (with teams enabled) can find the field in the Drizzle schema.
-- Nullable: invitations not scoped to a team leave this null.
ALTER TABLE "auth"."invitations"
  ADD COLUMN "team_id" uuid
  REFERENCES "auth"."teams"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX "invitations_team_id_idx"
  ON "auth"."invitations" USING btree ("team_id");
