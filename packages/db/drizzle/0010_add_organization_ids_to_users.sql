ALTER TABLE "auth"."users" ADD COLUMN "organization_ids" uuid[] DEFAULT '{}' NOT NULL;

-- Populate existing organization_ids from members table
UPDATE "auth"."users" AS u
SET "organization_ids" = (
  SELECT ARRAY_AGG(DISTINCT m."organization_id")
  FROM "auth"."members" AS m
  WHERE m."user_id" = u."id"
)
WHERE EXISTS (
  SELECT 1 FROM "auth"."members" WHERE "user_id" = u."id"
);

-- Create trigger function to sync organization_ids
CREATE OR REPLACE FUNCTION "auth"."sync_user_organization_ids"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "auth"."users"
  SET "organization_ids" = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT "organization_id"), '{}')
    FROM "auth"."members"
    WHERE "user_id" = COALESCE(NEW."user_id", OLD."user_id")
  )
  WHERE "id" = COALESCE(NEW."user_id", OLD."user_id");

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for INSERT, UPDATE, DELETE on members
CREATE TRIGGER "sync_user_orgs_insert_update"
AFTER INSERT OR UPDATE ON "auth"."members"
FOR EACH ROW
EXECUTE FUNCTION "auth"."sync_user_organization_ids"();

CREATE TRIGGER "sync_user_orgs_delete"
AFTER DELETE ON "auth"."members"
FOR EACH ROW
EXECUTE FUNCTION "auth"."sync_user_organization_ids"();