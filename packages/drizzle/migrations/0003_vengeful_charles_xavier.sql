CREATE TYPE "public"."payment_refund_reason_type" AS ENUM('dissatisfied', 'not_as_expected', 'duplicate_payment', 'changed_mind', 'technical_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_refund_request_status" AS ENUM('pending', 'processing', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."data_tracker_chart_type" AS ENUM('line', 'bar', 'pie');--> statement-breakpoint
CREATE TYPE "public"."data_tracker_column_type" AS ENUM('text', 'number');--> statement-breakpoint
CREATE TYPE "public"."data_tracker_scope" AS ENUM('personal', 'organization', 'all');--> statement-breakpoint
CREATE TYPE "public"."data_tracker_source" AS ENUM('manual', 'csv_import', 'api');--> statement-breakpoint
CREATE TYPE "public"."profile_withdrawal_reason_type" AS ENUM('no_longer_use', 'lack_features', 'difficult_to_use', 'too_expensive', 'found_alternative', 'other');--> statement-breakpoint
CREATE TYPE "public"."family_invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."family_member_role" AS ENUM('owner', 'guardian', 'therapist', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_message_role" AS ENUM('agent', 'user');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_session_status" AS ENUM('uploading', 'parsing', 'analyzing', 'analyzed', 'reviewed', 'spec_generated', 'project_created', 'executing', 'executed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_session_type" AS ENUM('customer', 'operator');--> statement-breakpoint
CREATE TABLE "payment_refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"subscription_id" uuid,
	"reason_type" "payment_refund_reason_type" NOT NULL,
	"reason_detail" text,
	"requested_amount" integer,
	"status" "payment_refund_request_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"processed_by" uuid,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_tracker_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"data_type" "data_tracker_column_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_tracker_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"tracker_id" uuid NOT NULL,
	"date" date NOT NULL,
	"data" jsonb NOT NULL,
	"source" "data_tracker_source" DEFAULT 'manual' NOT NULL,
	"created_by_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_tracker_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"slug" varchar(200) NOT NULL,
	"chart_type" "data_tracker_chart_type" NOT NULL,
	"chart_config" jsonb NOT NULL,
	"scope" "data_tracker_scope" DEFAULT 'all' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid NOT NULL,
	CONSTRAINT "data_tracker_trackers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_withdrawal_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason_type" "profile_withdrawal_reason_type" NOT NULL,
	"reason_detail" text
);
--> statement-breakpoint
CREATE TABLE "family_child_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"child_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "uq_family_child_assignments_child_therapist" UNIQUE("child_id","therapist_id")
);
--> statement-breakpoint
CREATE TABLE "family_children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"birth_date" date NOT NULL,
	"gender" varchar(10),
	"notes" text,
	"avatar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"role" "family_member_role" NOT NULL,
	"status" "family_invitation_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "family_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "family_member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_family_members_group_user" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_desk_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"storage_url" text NOT NULL,
	"parsed_content" text,
	"parsed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_desk_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "agent_desk_message_role" NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_desk_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "agent_desk_session_type" NOT NULL,
	"status" "agent_desk_session_status" DEFAULT 'uploading' NOT NULL,
	"title" varchar(200),
	"prompt" text,
	"created_by_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_licenses" RENAME COLUMN "lemon_squeezy_id" TO "external_id";--> statement-breakpoint
ALTER TABLE "payment_orders" RENAME COLUMN "lemon_squeezy_id" TO "external_id";--> statement-breakpoint
ALTER TABLE "payment_products" RENAME COLUMN "lemon_squeezy_id" TO "external_id";--> statement-breakpoint
ALTER TABLE "payment_subscriptions" RENAME COLUMN "lemon_squeezy_id" TO "external_id";--> statement-breakpoint
ALTER TABLE "payment_plans" RENAME COLUMN "lemon_squeezy_product_id" TO "provider_product_id";--> statement-breakpoint
ALTER TABLE "payment_plans" RENAME COLUMN "lemon_squeezy_variant_id" TO "provider_variant_id";--> statement-breakpoint
ALTER TABLE "payment_licenses" DROP CONSTRAINT "payment_licenses_lemon_squeezy_id_unique";--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_lemon_squeezy_id_unique";--> statement-breakpoint
ALTER TABLE "payment_products" DROP CONSTRAINT "payment_products_lemon_squeezy_id_unique";--> statement-breakpoint
ALTER TABLE "payment_subscriptions" DROP CONSTRAINT "payment_subscriptions_lemon_squeezy_id_unique";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_licenses" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_products" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_subscriptions" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD COLUMN "provider" text DEFAULT 'lemon-squeezy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refund_requests" ADD CONSTRAINT "payment_refund_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund_requests" ADD CONSTRAINT "payment_refund_requests_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund_requests" ADD CONSTRAINT "payment_refund_requests_subscription_id_payment_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."payment_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund_requests" ADD CONSTRAINT "payment_refund_requests_processed_by_profiles_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_tracker_columns" ADD CONSTRAINT "data_tracker_columns_tracker_id_data_tracker_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."data_tracker_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_tracker_entries" ADD CONSTRAINT "data_tracker_entries_tracker_id_data_tracker_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."data_tracker_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_tracker_entries" ADD CONSTRAINT "data_tracker_entries_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_tracker_trackers" ADD CONSTRAINT "data_tracker_trackers_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_withdrawal_reasons" ADD CONSTRAINT "profile_withdrawal_reasons_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_child_assignments" ADD CONSTRAINT "family_child_assignments_child_id_family_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."family_children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_child_assignments" ADD CONSTRAINT "family_child_assignments_therapist_id_profiles_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_child_assignments" ADD CONSTRAINT "family_child_assignments_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_group_id_family_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_group_id_family_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_group_id_family_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_desk_files" ADD CONSTRAINT "agent_desk_files_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_desk_messages" ADD CONSTRAINT "agent_desk_messages_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD CONSTRAINT "agent_desk_sessions_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_tracker_columns_tracker_sort" ON "data_tracker_columns" USING btree ("tracker_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_data_tracker_entries_tracker_date" ON "data_tracker_entries" USING btree ("tracker_id","date");--> statement-breakpoint
CREATE INDEX "idx_data_tracker_entries_tracker_user" ON "data_tracker_entries" USING btree ("tracker_id","created_by_id");--> statement-breakpoint
ALTER TABLE "payment_licenses" ADD CONSTRAINT "uq_payment_licenses_external_provider" UNIQUE("external_id","provider");--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "uq_payment_orders_external_provider" UNIQUE("external_id","provider");--> statement-breakpoint
ALTER TABLE "payment_products" ADD CONSTRAINT "uq_payment_products_external_provider" UNIQUE("external_id","provider");--> statement-breakpoint
ALTER TABLE "payment_subscriptions" ADD CONSTRAINT "uq_payment_subscriptions_external_provider" UNIQUE("external_id","provider");