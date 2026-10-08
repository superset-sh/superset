CREATE INDEX "cloud_workspace_activity_target_user_id_idx" ON "cloud_workspace_activity" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_target_team_id_idx" ON "cloud_workspace_activity" USING btree ("target_team_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_shares_shared_by_user_id_idx" ON "cloud_workspace_shares" USING btree ("shared_by_user_id");--> statement-breakpoint
CREATE INDEX "page_shares_shared_by_user_id_idx" ON "page_shares" USING btree ("shared_by_user_id");