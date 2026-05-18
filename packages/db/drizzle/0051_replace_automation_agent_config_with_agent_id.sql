ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "agent" text;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'automations'
      AND column_name = 'agent_config'
  ) THEN
    EXECUTE $sql$
      UPDATE "automations"
         SET "agent" = COALESCE(NULLIF("agent_config" ->> 'id', ''), 'claude')
       WHERE "agent" IS NULL
    $sql$;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "agent" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN IF EXISTS "agent_config";