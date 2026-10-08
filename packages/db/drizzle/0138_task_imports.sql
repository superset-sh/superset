CREATE TABLE "task_imports" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text NOT NULL,
	"imported_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_imports_org_provider_external_unique" UNIQUE("organization_id","provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "task_imports" ADD CONSTRAINT "task_imports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_imports" ADD CONSTRAINT "task_imports_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;