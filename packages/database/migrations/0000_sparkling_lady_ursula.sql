CREATE TYPE "public"."snapforge_plan" AS ENUM('free', 'pro', 'scale');--> statement-breakpoint
CREATE TYPE "public"."capture_reservation_source" AS ENUM('monthly', 'prepaid');--> statement-breakpoint
CREATE TYPE "public"."capture_reservation_status" AS ENUM('held', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"plan" "snapforge_plan" DEFAULT 'free' NOT NULL,
	"prepaid_credits" integer DEFAULT 0 NOT NULL,
	"dodo_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_dodo_customer_id_unique" UNIQUE("dodo_customer_id"),
	CONSTRAINT "accounts_prepaid_nonnegative" CHECK ("accounts"."prepaid_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "capture_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"url" text NOT NULL,
	"format" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer NOT NULL,
	"blocked_requests" integer DEFAULT 0 NOT NULL,
	"code" text,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "capture_reservations" (
	"request_id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"user_id" text NOT NULL,
	"source" "capture_reservation_source" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"status" "capture_reservation_status" DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "capture_reservations_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "dodo_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_usage" (
	"user_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"capture_limit" integer NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "monthly_usage_counts_nonnegative" CHECK ("monthly_usage"."capture_limit" >= 0 AND "monthly_usage"."consumed" >= 0 AND "monthly_usage"."reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"plan" "snapforge_plan" NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_logs" ADD CONSTRAINT "capture_logs_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD CONSTRAINT "capture_reservations_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_created_idx" ON "api_keys" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "capture_logs_user_time_idx" ON "capture_logs" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX "capture_logs_user_ok_time_idx" ON "capture_logs" USING btree ("user_id","ok","captured_at");--> statement-breakpoint
CREATE INDEX "capture_reservations_user_status_idx" ON "capture_reservations" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_usage_user_period_uidx" ON "monthly_usage" USING btree ("user_id","period_start");