CREATE TYPE "public"."v2_users_device_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
ALTER TABLE "v2_users_devices" ALTER COLUMN "role" SET DEFAULT 'member'::"public"."v2_users_device_role";--> statement-breakpoint
ALTER TABLE "v2_users_devices" ALTER COLUMN "role" SET DATA TYPE "public"."v2_users_device_role" USING "role"::"public"."v2_users_device_role";