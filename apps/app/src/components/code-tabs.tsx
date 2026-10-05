"use client";

import { Icon } from "./icons";

export function CodeTabs<K extends string>({
  tabs,
  active,
  onChange,
  code,
}: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  code: string;
}) {
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={active === tab.key}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              active === tab.key
                ? "border-accent text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="max-h-96 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-ink-2">
          <code>{code}</code>
        </pre>
        <span className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-pill border border-line bg-raised px-2 py-1 text-[10px] text-ink-3">
          <Icon name="copy" className="size-3" />
          {code.split("\n").length} lines
        </span>
      </div>
    </div>
  );
}
