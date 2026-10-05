import { sql } from "drizzle-orm";
import type { CaptureJobResult, CaptureMode, JobSnapshot } from "@snapforge/queue";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("snapforge_plan", ["free", "pro", "scale"]);
export const reservationSourceEnum = pgEnum("capture_reservation_source", ["monthly", "prepaid"]);
export const reservationStatusEnum = pgEnum("capture_reservation_status", ["held", "consumed", "released"]);

export const accounts = pgTable("accounts", {
  userId: text("user_id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  plan: planEnum("plan").notNull().default("free"),
  prepaidCredits: integer("prepaid_credits").notNull().default(0),
  dodoCustomerId: text("dodo_customer_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("accounts_prepaid_nonnegative", sql`${table.prepaidCredits} >= 0`)]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [index("api_keys_user_created_idx").on(table.userId, table.createdAt)]);

export const monthlyUsage = pgTable("monthly_usage", {
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  limit: integer("capture_limit").notNull(),
  consumed: integer("consumed").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
}, (table) => [
  uniqueIndex("monthly_usage_user_period_uidx").on(table.userId, table.periodStart),
  check("monthly_usage_counts_nonnegative", sql`${table.limit} >= 0 AND ${table.consumed} >= 0 AND ${table.reserved} >= 0`),
]);

export const captureReservations = pgTable("capture_reservations", {
  requestId: text("request_id").primaryKey(),
  jobId: text("job_id").unique(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  source: reservationSourceEnum("source").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  status: reservationStatusEnum("status").notNull().default("held"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  result: jsonb("result").$type<JobSnapshot>(),
  apiKeyId: text("api_key_id"),
  cleanupPending: boolean("cleanup_pending").notNull().default(false),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
  nextCleanupAt: timestamp("next_cleanup_at", { withTimezone: true }).notNull().defaultNow(),
  pruned: boolean("pruned").notNull().default(false),
  submissionCiphertext: text("submission_ciphertext"),
  submissionMode: text("submission_mode").$type<CaptureMode>(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  enqueueAcknowledged: boolean("enqueue_acknowledged").notNull().default(false),
  nextEnqueueAt: timestamp("next_enqueue_at", { withTimezone: true }).notNull().defaultNow(),
  requestFingerprint: text("request_fingerprint"),
  webhookCiphertext: text("webhook_ciphertext"),
}, (table) => [
  index("capture_reservations_user_status_idx").on(table.userId, table.status),
  index("capture_reservations_recovery_idx").on(table.nextCheckAt).where(sql`${table.status} = 'held' AND ${table.jobId} IS NOT NULL`),
  index("capture_reservations_cleanup_idx").on(table.nextCleanupAt).where(sql`${table.cleanupPending}`),
  index("capture_reservations_pruning_idx").on(table.settledAt).where(sql`${table.result} IS NOT NULL AND NOT ${table.cleanupPending} AND NOT ${table.pruned}`),
  index("capture_reservations_enqueue_idx").on(table.nextEnqueueAt).where(sql`${table.status} = 'held' AND ${table.submissionCiphertext} IS NOT NULL`),
]);

export const webhookOutbox = pgTable("webhook_outbox", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().unique().references(() => captureReservations.jobId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id"),
  targetCiphertext: text("target_ciphertext").notNull(),
  result: jsonb("result").$type<CaptureJobResult>().notNull(),
  state: text("state").$type<"pending" | "delivered" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  generation: integer("generation").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseToken: text("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  statusCode: integer("status_code"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("webhook_outbox_pending_idx").on(table.nextAttemptAt).where(sql`${table.state} = 'pending'`)]);

export const captureLogs = pgTable("capture_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  ok: boolean("ok").notNull(),
  cached: boolean("cached").notNull().default(false),
  url: text("url").notNull(),
  format: text("format").notNull(),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes").notNull().default(0),
  durationMs: integer("duration_ms").notNull(),
  blockedRequests: integer("blocked_requests").notNull().default(0),
  code: text("code"),
  message: text("message"),
}, (table) => [
  index("capture_logs_user_time_idx").on(table.userId, table.capturedAt),
  index("capture_logs_user_ok_time_idx").on(table.userId, table.ok, table.capturedAt),
]);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  plan: planEnum("plan").notNull(),
  status: text("status").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dodoWebhookEvents = pgTable("dodo_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { accounts, apiKeys, monthlyUsage, captureReservations, webhookOutbox, captureLogs, subscriptions, dodoWebhookEvents };
