import { serve } from "@hono/node-server";
import { WebhookDeliveryConsumer, captureSubmissionCodecFromEnv, createQueue, createQueueConnection, createQueueEvents, createQueueEventsWaiter, CaptureCompletionConsumer, RedisCaptureAdmission, CaptureDispatcher, CaptureQueue, HotCache, resolveQueueConfig, readyWorkerCount } from "@snapforge/queue";
import { createGateway } from "./gateway.js";
import { webhookDeliveries, captureLifecycle, captureSubmissions, findApiKeyByHash, linkReservationToJob, pool, recordCapture, reservationForJob, reserveCapture, settleCapture } from "@snapforge/database";

const config = resolveQueueConfig();
const submissionCodec = captureSubmissionCodecFromEnv();
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError("PORT must be an integer from 1 to 65535");
const connection = createQueueConnection(config);
const queueHost = createQueue(config, connection.producer);
const queue = new CaptureQueue(queueHost, config);
const events = await createQueueEvents(config, connection.producer);
const dispatcher = new CaptureDispatcher(queue, config, createQueueEventsWaiter(events, queue));
const billing = { reserveCapture, settleCapture, linkReservationToJob, reservationForJob, recordCapture, lifecycle: captureLifecycle, submissions: captureSubmissions };
const hotCache = new HotCache({ maxEntries: Number(process.env.SNAPFORGE_HOT_CACHE_ENTRIES ?? 4096) });
const completion = new CaptureCompletionConsumer({ queue, events, billing, dispatcher, submissionCodec, hotCache,
  admission: new RedisCaptureAdmission(connection.producer, { leaseMs: 7_200_000 }),
  retentionSeconds: Math.max(config.resultTtlSeconds, config.failedTtlSeconds),
  logger: (message, fields) => { console.info(message, fields); },
});
try {
  await pool.query("SELECT request_fingerprint, webhook_ciphertext FROM capture_reservations LIMIT 0");
  await pool.query("SELECT id FROM webhook_outbox LIMIT 0");
  await completion.start();
} catch (error) {
  await Promise.allSettled([events.close(), queue.close()]);
  await connection.close();
  await pool.end();
  throw error;
}
const webhooks = new WebhookDeliveryConsumer(webhookDeliveries, submissionCodec, { logger: (message, fields) => console.info(message, fields) });
webhooks.start();
const app = createGateway({ redis: connection.producer, queue, dispatcher, submissionCodec, webhooks: webhookDeliveries,
  webhookStats: () => webhooks.stats(), settlementStats: () => completion.stats(), readyWorkers: () => readyWorkerCount(connection.producer, config), database: {
  ...billing,
  ping: async () => { await pool.query("SELECT 1"); },
  findApiKeyByHash,
}, hotCache });

const server = serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, (info) => {
  process.stdout.write(`Snapforge API listening on ${info.address}:${info.port}\n`);
});

const shutdown = async () => {
  await new Promise<void>((resolve) => { server.close(() => resolve()); });
  await completion.close();
  await webhooks.close();
  await events.close();
  await queue.close();
  await connection.close();
  await pool.end();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
