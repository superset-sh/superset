-- Custom SQL migration file, put your code below! --
UPDATE "users__slack_users" SET "model_preference" = 'claude-opus-4-8' WHERE "model_preference" = 'claude-opus-4-7';