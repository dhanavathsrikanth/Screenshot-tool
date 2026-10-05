"use client";

import { useState } from "react";
import { Button } from "./ui";

type ProductKey = "pro" | "scale" | "credits_10k" | "credits_50k" | "credits_250k";

export function BillingButton({ product, children }: { product: ProductKey; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const result = await response.json() as { checkout_url?: string; error?: string };
      if (!response.ok || !result.checkout_url) throw new Error(result.error ?? "Could not start checkout");
      window.location.assign(result.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="primary" onClick={startCheckout} disabled={busy} className="mt-6 w-full">
        {busy ? "Opening checkout…" : children}
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs text-bad-ink">{error}</p> : null}
    </div>
  );
}

export function CustomerPortalButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function openPortal() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/customer-portal", { redirect: "manual" });
      if (response.type === "opaqueredirect") {
        window.location.assign("/api/customer-portal");
        return;
      }
      if (response.redirected && new URL(response.url).origin !== window.location.origin) {
        window.location.assign(response.url);
        return;
      }
      const message = await response.text();
      if (!response.ok) throw new Error(message || "Could not open the billing portal");
      window.location.assign(response.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Could not open the billing portal");
      setBusy(false);
    }
  }
  return (
    <div>
      <Button onClick={openPortal} disabled={busy}>{busy ? "Opening portal…" : "Manage billing"}</Button>
      {error ? <p role="alert" className="mt-2 text-xs text-bad-ink">{error}</p> : null}
    </div>
  );
}
