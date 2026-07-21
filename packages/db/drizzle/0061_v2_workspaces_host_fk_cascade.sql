ALTER TABLE "v2_workspaces" DROP CONSTRAINT "v2_workspaces_host_fk";
--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;