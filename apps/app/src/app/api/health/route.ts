import type { EngineHealthPayload } from "@/lib/capture";
import { getCaptureRuntime, localCaptureEnabled } from "@/lib/capture-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!localCaptureEnabled()) {
      const health = await (await getCaptureRuntime()).health();
      return Response.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
    }
    const { getEngine, getStoreStats } = await import("@/lib/engine");
    const engine = await getEngine();
    const health = await engine.health();
    const stats = getStoreStats();
    const payload: EngineHealthPayload = {
      ok: health.ok,
      in_flight: health.in_flight,
      concurrency: engine.concurrency,
      concurrency_target: engine.concurrencyTarget,
      browser: health.browser,
      pool: {
        size: health.pool.size,
        busy: health.pool.busy,
        idle: health.pool.idle,
        recycling: health.pool.recycling,
        restarts: health.pool.restarts,
        queued: health.pool.queued,
        budget: health.pool.budget,
      },
      cache: stats
        ? {
            hits: stats.hits,
            misses: stats.misses,
            writes: stats.writes,
            hit_rate: Number(stats.hitRate.toFixed(3)),
          }
        : null,
    };
    return Response.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        ok: false,
        in_flight: 0,
        concurrency: 0,
        concurrency_target: 0,
        browser: null,
        pool: null,
        cache: null,
        error: "Capture service unavailable",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
