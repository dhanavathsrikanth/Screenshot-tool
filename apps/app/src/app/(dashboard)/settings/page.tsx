"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { Button, Card, CardHeader, Label, PageHeader, Select, Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DEVICE_PRESETS } from "@snapforge/contracts";
import { DEFAULT_PREFS, preferenceSnapshot, readPreferences, savePreferences, subscribePreferences, type ConsolePrefs } from "@/lib/console-preferences";

export default function SettingsPage() {
  const [draft, setDraft] = useState<ConsolePrefs | null>(null);
  const storedVersion = useSyncExternalStore(subscribePreferences, preferenceSnapshot, () => null);
  const prefs = draft ?? (storedVersion ? readPreferences() : DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const clerk = useClerk();
  const update = <K extends keyof ConsolePrefs>(key: K, value: ConsolePrefs[K]) => { setSaved(false); setDraft((previous) => ({ ...(previous ?? prefs), [key]: value })); };
  const persist = () => {
    try { savePreferences(prefs); setSaved(true); setError(""); }
    catch { setError("Your browser could not save these preferences. Allow site storage and try again."); }
  };
  return (
    <div className="space-y-7">
      <PageHeader title="Settings" description="Make the capture workspace feel like yours. Preferences are saved in this browser." action={<Button variant="primary" onClick={persist}><Icon name={saved ? "check" : "sliders"} />{saved ? "Changes saved" : "Save changes"}</Button>} />
      <p aria-live="polite" className={error ? "text-sm text-bad-ink" : "sr-only"}>{error || (saved ? "Preferences saved." : "")}</p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="space-y-6">
          <Card><CardHeader title="Capture defaults" description="Applied when you open or reset the playground" /><div className="space-y-5 p-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="default-device">Device</Label><Select id="default-device" value={prefs.defaultDevice} onChange={(event) => update("defaultDevice", event.target.value)}>{Object.keys(DEVICE_PRESETS).map((name) => <option key={name} value={name}>{name.replace(/_/g, " ")}</option>)}</Select></div><div className="space-y-2"><Label htmlFor="default-format">File format</Label><Select id="default-format" value={prefs.defaultFormat} onChange={(event) => update("defaultFormat", event.target.value as ConsolePrefs["defaultFormat"])}>{["png", "jpeg", "webp", "pdf"].map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}</Select></div></div><Toggle checked={prefs.fullPageByDefault} onChange={(value) => update("fullPageByDefault", value)} label="Capture the full page" description="Include content below the initial viewport." /></div></Card>
          <Card><CardHeader title="Workspace preferences" description="Keep the details you need close at hand" /><div className="space-y-3 p-5"><Toggle checked={prefs.autoRefreshLogs} onChange={(value) => update("autoRefreshLogs", value)} label="Refresh capture history automatically" description="Check for new results every eight seconds." /><Toggle checked={prefs.showBlockedRequests} onChange={(value) => update("showBlockedRequests", value)} label="Show filtered request counts" description="Include ad and tracker filtering totals in capture results." /></div></Card>
        </div>
        <div className="space-y-6"><Card><CardHeader title="Your account" description="Manage your profile and workspace access" /><div className="space-y-4 p-5"><p className="text-[13px] leading-relaxed text-ink-3">Update your profile, sign-in methods, and account security from your account settings.</p><Button onClick={() => clerk.openUserProfile()} className="w-full"><Icon name="shield" />Manage account</Button><Link href="/api-keys" className="flex items-center justify-between border-t border-line pt-4 text-[13px] text-ink-2">Manage API keys<Icon name="chevron" className="size-3" /></Link><Link href="/billing" className="flex items-center justify-between text-[13px] text-ink-2">Billing and credits<Icon name="chevron" className="size-3" /></Link></div></Card><Card><CardHeader title="A workspace that stays out of the way" /><div className="space-y-3 p-5 text-xs leading-relaxed text-ink-3"><p>Use the sidebar button to switch to a compact icon rail. Your choice stays saved in this browser.</p><p>Find a page with <kbd className="font-mono text-ink-2">Ctrl / ⌘ K</kbd>. Toggle the sidebar with <kbd className="font-mono text-ink-2">Ctrl / ⌘ B</kbd>.</p></div></Card></div>
      </div>
    </div>
  );
}
