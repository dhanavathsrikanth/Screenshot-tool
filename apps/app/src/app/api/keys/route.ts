import { createHash, randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ApiKeyLimitError, createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from "@snapforge/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const KEY_SCOPES = ["screenshot:read", "screenshot:write", "jobs:read", "webhooks:write"] as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const keys = await listApiKeys(userId);
  return Response.json({ keys: keys.map((key) => ({
    id: key.id, name: key.label, prefix: key.prefix, scopes: key.scopes,
    created_at: key.createdAt.getTime(), last_used_at: key.lastUsedAt?.getTime() ?? null,
    revoked_at: key.revokedAt?.getTime() ?? null,
  })), scopes: KEY_SCOPES }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; scopes?: unknown; rotate_id?: string };
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }
  const previous = body.rotate_id ? (await listApiKeys(userId)).find((item) => item.id === body.rotate_id && !item.revokedAt) : undefined;
  if (body.rotate_id && !previous) return Response.json({ error: "active key not found" }, { status: 404 });
  const name = (body.name ?? (previous ? previous.label : "")).trim();
  if (name.length < 2 || name.length > 80) return Response.json({ error: "Label must be 2–80 characters" }, { status: 400 });
  const scopes: (typeof KEY_SCOPES)[number][] = Array.isArray(body.scopes)
    ? body.scopes.filter((scope): scope is (typeof KEY_SCOPES)[number] => typeof scope === "string" && (KEY_SCOPES as readonly string[]).includes(scope))
    : (previous?.scopes ?? []).filter((scope): scope is (typeof KEY_SCOPES)[number] => (KEY_SCOPES as readonly string[]).includes(scope));
  const selectedScopes = scopes.length ? [...new Set(scopes)] : [...KEY_SCOPES];
  const secret = `sf_live_${randomBytes(24).toString("base64url")}`;
  let key;
  const keyInput = {
    id: randomBytes(12).toString("hex"), userId, label: name,
    prefix: secret.slice(0, 12), keyHash: createHash("sha256").update(secret).digest("hex"), scopes: selectedScopes,
  };
  try {
    key = previous
      ? await rotateApiKey(userId, previous.id, keyInput)
      : await createApiKey(keyInput);
    if (!key) return Response.json({ error: "key changed during rotation" }, { status: 409 });
  } catch (error) {
    if (error instanceof ApiKeyLimitError) return Response.json({ error: error.message, upgrade_required: true }, { status: 403 });
    throw error;
  }
  return Response.json({ key: {
    id: key.id, name: key.label, prefix: key.prefix, secret: secret, scopes: key.scopes,
    created_at: key.createdAt.getTime(), last_used_at: null, revoked_at: null,
  } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const revoked = await revokeApiKey(userId, id);
  if (!revoked) return Response.json({ error: "key not found or already revoked" }, { status: 404 });
  return Response.json({ ok: true });
}
