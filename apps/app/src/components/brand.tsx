export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[9px] bg-p-600 text-n-0 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[65%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 12h8m-4-4v8" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      <span className="text-[17px] font-semibold tracking-[-0.6px] text-ink">Snapforge<span className="text-accent-ink">.</span></span>
    </span>
  );
}
