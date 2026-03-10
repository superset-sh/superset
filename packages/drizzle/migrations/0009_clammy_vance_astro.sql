CREATE TYPE "public"."auth_provider" AS ENUM('email', 'google', 'naver', 'kakao');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "auth_provider" "auth_provider" DEFAULT 'email';