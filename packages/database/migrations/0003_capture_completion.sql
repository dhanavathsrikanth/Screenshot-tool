ALTER TABLE "capture_reservations" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "api_key_id" text;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "cleanup_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "next_check_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "next_cleanup_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "pruned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "capture_reservations_recovery_idx" ON "capture_reservations" USING btree ("next_check_at") WHERE "capture_reservations"."status" = 'held' AND "capture_reservations"."job_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "capture_reservations_cleanup_idx" ON "capture_reservations" USING btree ("next_cleanup_at") WHERE "capture_reservations"."cleanup_pending";--> statement-breakpoint
CREATE INDEX "capture_reservations_pruning_idx" ON "capture_reservations" USING btree ("settled_at") WHERE "capture_reservations"."result" IS NOT NULL AND NOT "capture_reservations"."cleanup_pending" AND NOT "capture_reservations"."pruned";