"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/format";

type KeyScope = "screenshot:read" | "screenshot:write" | "jobs:read" | "webhooks:write";

interface PublicKey {
  id: string;
  name: string;
  prefix: string;
  scopes: KeyScope[];
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

const SCOPE_LABELS: Record<string, string> = {
  "screenshot:read": "Read screenshots",
  "screenshot:write": "Create screenshots",
  "jobs:read": "Read jobs",
  "webhooks:write": "Manage webhooks",
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<PublicKey[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/keys", { cache: "no-store" });
      if (!response.ok) throw new Error("API keys could not be loaded. Please refresh the page.");
      const payload = (await response.json()) as { keys: PublicKey[]; scopes: string[] };
      setKeys(payload.keys);
      setScopes(payload.scopes);
      setSelected((previous) => previous.length === 0 ? payload.scopes : previous.filter((scope) => payload.scopes.includes(scope)));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load API keys."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const create = async () => {
    if (await issueKey({ name, scopes: selected })) setName("");
  };

  const issueKey = async (body: { name: string; scopes: string[]; rotate_id?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { key?: { secret: string }; error?: string };
      if (!response.ok || !payload.key) {
        setError(payload.error ?? "Could not create key");
        return false;
      }
      setIssued(payload.key.secret);
      await load();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create key. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (key: PublicKey) => {
    await issueKey({ name: key.name, scopes: key.scopes, rotate_id: key.id });
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("The API key could not be revoked. Please try again.");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not revoke key."); }
    finally { setBusy(false); }
  };

  const copyIssued = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued); setIssued(null); }
    catch { setError("Could not access the clipboard. Select and copy the key before closing this page."); }
  };

  const toggleScope = (scope: string) => {
    setSelected((previous) =>
      previous.includes(scope) ? previous.filter((value) => value !== scope) : [...previous, scope],
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access control"
        title="API keys"
        description="Keys authenticate every request to the capture API. Store them in your secret manager — the secret is shown once, at creation."
      />

      {issued ? (
        <Card className="border-accent/50 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-ok/15 text-ok-ink">
              <Icon name="key" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-ink">Key issued</p>
              <p className="mt-1 text-sm text-ink-3">Copy it now — it cannot be retrieved again.</p>
              <code className="mt-3 block overflow-x-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs text-accent-ink">
                {issued}
              </code>
            </div>
            <Button
              variant="ghost"
              aria-label="Copy API key and close"
              onClick={() => void copyIssued()}
            >
              <Icon name="copy" className="size-4" />
              Copy &amp; close
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Keys" description={loading ? "Loading your keys…" : `${keys.length} key${keys.length === 1 ? "" : "s"}`} />
          {keys.length === 0 ? (
            <EmptyState
              icon="key"
              title={loading ? "Loading API keys" : "No API keys yet"}
              description="Create a scoped key to authenticate requests. Secrets are shown once and stored as hashes."
            />
          ) : (
            <ul className="divide-y divide-line">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-ink-2">
                    <Icon name="key" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm text-ink">{key.name}</p>
                      {key.revoked_at ? <Badge tone="danger">revoked</Badge> : null}
                    </div>
                    <p className="mt-0.5 break-words font-mono text-xs text-ink-3">
                      {key.prefix}•••• • created {formatRelative(key.created_at)} •{" "}
                      {key.last_used_at ? `used ${formatRelative(key.last_used_at)}` : "never used"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} tone="neutral">
                          {SCOPE_LABELS[scope] ?? scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {key.revoked_at ? null : (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" disabled={busy} onClick={() => void rotate(key)}>
                        <Icon name="refresh" className="size-4" />
                        Rotate
                      </Button>
                      <Button variant="danger" disabled={busy} onClick={() => void revoke(key.id)}>
                        <Icon name="trash" className="size-4" />
                        Revoke
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Create key" description="Pick the narrowest scope set" />
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Label</Label>
              <Input
                id="key-name"
                value={name}
                placeholder="Production worker"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {scopes.map((scope) => (
                <label
                  key={scope}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5 text-sm transition-colors hover:border-line-strong"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="size-4 accent-[var(--sf-color-primary-600)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-ink">{SCOPE_LABELS[scope] ?? scope}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{scope}</span>
                  </span>
                </label>
              ))}
            </div>
            {error ? <p role="alert" className="text-xs text-bad-ink">{error}</p> : null}
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || loading || !selected.length || name.trim().length < 2}
              onClick={() => void create()}
            >
              <Icon name="key" className="size-4" />
              {busy ? "Creating…" : "Create key"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
