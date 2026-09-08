CREATE TABLE "plugin_oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_secret_expires_at" timestamp,
	"registration_access_token" text,
	"registration_client_uri" text,
	"token_endpoint_auth_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_oauth_clients_issuer_redirect_unique" ON "plugin_oauth_clients" USING btree ("issuer","redirect_uri");