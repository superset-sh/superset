CREATE TABLE "auth"."team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth"."teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "auth"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."team_members" ADD CONSTRAINT "team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_members_team_id_idx" ON "auth"."team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "auth"."team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_organization_id_idx" ON "auth"."team_members" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_unique" ON "auth"."team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "auth"."teams" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_slug_unique" ON "auth"."teams" USING btree ("organization_id","slug");--> statement-breakpoint

-- Auto-populate team_members.organization_id from the row's team. Lets
-- Electric (and any other consumer) filter team_members by organization_id
-- with a plain equality, instead of joining through teams. Always overwrite
-- so a caller can't persist a mismatched org_id and break the shape filter.
CREATE OR REPLACE FUNCTION "auth"."team_members_set_organization_id"()
RETURNS TRIGGER AS $$
DECLARE
	team_org_id uuid;
BEGIN
	SELECT organization_id INTO team_org_id
	FROM "auth"."teams" WHERE id = NEW.team_id;

	IF team_org_id IS NULL THEN
		RAISE EXCEPTION 'team % not found', NEW.team_id;
	END IF;

	NEW.organization_id = team_org_id;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "team_members_set_organization_id"
BEFORE INSERT ON "auth"."team_members"
FOR EACH ROW EXECUTE FUNCTION "auth"."team_members_set_organization_id"();--> statement-breakpoint

-- Backfill: every existing organization gets one default team. Name + slug
-- mirror the organization to start; admins can rename later via team settings.
INSERT INTO "auth"."teams" (organization_id, name, slug)
SELECT id, name, slug FROM "auth"."organizations";--> statement-breakpoint

-- Backfill: every existing org member is added to that org's default team.
-- Going forward, afterAddMember auto-adds new org members to the oldest
-- team. organization_id is filled in by the trigger above.
INSERT INTO "auth"."team_members" (team_id, user_id)
SELECT t.id, m.user_id
FROM "auth"."teams" t
JOIN "auth"."members" m ON m.organization_id = t.organization_id;
