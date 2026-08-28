CREATE TABLE "review_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_pull_request_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_pages" ADD CONSTRAINT "review_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_pages" ADD CONSTRAINT "review_pages_github_pull_request_id_github_pull_requests_id_fk" FOREIGN KEY ("github_pull_request_id") REFERENCES "public"."github_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_pages" ADD CONSTRAINT "review_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_pages_organization_id_pr_id_unique" ON "review_pages" USING btree ("organization_id","github_pull_request_id");--> statement-breakpoint
CREATE INDEX "review_pages_page_id_idx" ON "review_pages" USING btree ("page_id");