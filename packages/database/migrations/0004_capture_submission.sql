ALTER TABLE "capture_reservations" ADD COLUMN "submission_ciphertext" text;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "submission_mode" text;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "enqueue_acknowledged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_reservations" ADD COLUMN "next_enqueue_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "capture_reservations_enqueue_idx" ON "capture_reservations" USING btree ("next_enqueue_at") WHERE "capture_reservations"."status" = 'held' AND "capture_reservations"."submission_ciphertext" IS NOT NULL;