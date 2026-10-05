import { captureStats, clearCaptures, listCaptures } from "@/lib/history";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [entries, stats] = await Promise.all([listCaptures(userId), captureStats(userId)]);
  return Response.json(
    { entries, stats },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await clearCaptures(userId);
  return Response.json({ ok: true });
}
