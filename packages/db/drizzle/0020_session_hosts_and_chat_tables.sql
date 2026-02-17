CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_hosts" ADD CONSTRAINT "session_hosts_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_hosts" ADD CONSTRAINT "session_hosts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_org_idx" ON "chat_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_created_by_idx" ON "chat_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_active_idx" ON "chat_sessions" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "session_hosts_session_id_idx" ON "session_hosts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_hosts_org_idx" ON "session_hosts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "session_hosts_device_id_idx" ON "session_hosts" USING btree ("device_id");