import { auth } from "@clerk/nextjs/server";
import { captureForAccount } from "@/lib/capture-runtime-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return captureForAccount(request, async () => (await auth()).userId);
}
