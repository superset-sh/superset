CREATE TYPE "public"."git_commit_author_mode" AS ENUM('you_only', 'superset_only', 'you_author_superset_committer', 'superset_author_you_committer');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"git_commit_author_mode" "git_commit_author_mode" DEFAULT 'you_only' NOT NULL,
	"git_commit_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;