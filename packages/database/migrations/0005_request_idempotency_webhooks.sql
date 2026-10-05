CREATE TABLE "webhook_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"target_ciphertext" text NOT NULL,
	"result" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"status_code" integer,
	"completed_at" timestamp with time zone,
	CONSTRAINT "webhook_outbox_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "webhook_ciphertext" text;--> statement-breakpoint
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_job_id_capture_reservations_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."capture_reservations"("job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_user_id_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_outbox_pending_idx" ON "webhook_outbox" USING btree ("next_attempt_at") WHERE "webhook_outbox"."state" = 'pending';