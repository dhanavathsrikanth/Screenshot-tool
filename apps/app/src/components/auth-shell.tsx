import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icons";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="sf-auth">
      <div className="sf-auth-story">
        <Link href="/" aria-label="Snapforge home"><Brand /></Link>
        <div className="sf-auth-details">
          <p className="mt-16 text-xs text-ink-3">The screenshot workspace</p>
          <h1 className="mt-4 text-[44px] leading-[1.1] font-medium tracking-[-1.8px]">Great captures.<br /><span className="sf-gradient-text">Less busywork.</span></h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-ink-3">Turn a URL into an image or PDF. Preview every detail, then connect the same workflow to your application.</p>
          <div aria-hidden="true" className="sf-intro mt-9 overflow-hidden"><div className="flex items-center gap-2 border-b border-line px-4 py-3"><Icon name="crop" className="size-4 text-accent-ink" /><span className="text-xs text-ink-2">Capture workspace</span><span className="ml-auto rounded border border-line px-2 py-0.5 font-mono text-[10px] text-ink-3">PNG · 1280 × 720</span></div><div className="grid grid-cols-[64px_1fr] gap-4 p-4"><div className="space-y-3 border-r border-line pr-4">{["grid", "play", "chart", "key"].map((name) => <span key={name} className={`flex size-8 items-center justify-center rounded-md ${name === "play" ? "bg-p-600/15 text-accent-ink" : "text-ink-3"}`}><Icon name={name as "grid" | "play" | "chart" | "key"} /></span>)}</div><div className="rounded-md border border-line bg-canvas p-5"><div className="h-2 w-16 rounded-full bg-p-600/50" /><div className="mt-3 h-3 w-3/4 rounded bg-raised" /><div className="mt-2 h-2 w-1/2 rounded bg-surface" /><div className="mt-5 grid grid-cols-3 gap-2">{[1, 2, 3].map((item) => <div key={item} className="h-16 rounded-md border border-line bg-surface" />)}</div></div></div></div>
          <p className="mt-6 text-xs text-ink-3">One place for screenshots, history, and your API.</p>
        </div>
      </div>
      <div className="sf-auth-form">{children}</div>
    </main>
  );
}
