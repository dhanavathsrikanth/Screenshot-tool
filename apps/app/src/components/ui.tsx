import { Icon, type IconName } from "./icons";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`sf-card border border-line ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-medium text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ink-3">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-2xl">
        <h1 title={eyebrow} className="text-[26px] leading-tight font-medium tracking-[-0.8px] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{description}</p>
      </div>
      {action}
    </div>
  );
}

const TONE_STYLES = {
  neutral: "border-line bg-raised text-ink-2",
  success: "border-transparent bg-ok/12 text-ok-ink",
  warning: "border-transparent bg-warn/12 text-warn-ink",
  danger: "border-transparent bg-bad/12 text-bad-ink",
  info: "border-transparent bg-info/12 text-info-ink",
  accent: "border-transparent bg-accent/15 text-accent-ink",
} as const;

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_STYLES;
  icon?: IconName;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      {icon ? <Icon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-n-0 hover:bg-accent-hover disabled:hover:bg-accent",
  secondary: "border border-line bg-raised text-ink hover:border-line-strong",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "border border-line bg-raised text-bad-ink hover:border-bad/50",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2"
    >
      <span>{children}</span>
      {hint ? <span className="text-ink-3/80 normal-case">{hint}</span> : null}
    </label>
  );
}

const CONTROL_BASE =
  "w-full min-h-9 rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3/70 transition-colors focus:border-p-400 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL_BASE} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${CONTROL_BASE} resize-y font-mono text-xs leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL_BASE} ${props.className ?? ""}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5 transition-colors ${checked ? "bg-accent" : "bg-line-strong"}`}
      >
        <span
          className={`size-4 rounded-pill bg-n-0 transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-ink-3">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-pill bg-line-strong accent-[var(--sf-color-primary-600)]"
      />
      <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-2 tabular-nums">
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: IconName;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const toneClass = {
    neutral: "text-ink",
    success: "text-ok-ink",
    warning: "text-warn-ink",
    danger: "text-bad-ink",
    accent: "text-accent-ink",
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-3">
          {label}
        </p>
        {icon ? <Icon name={icon} className="size-4 text-ink-3" /> : null}
      </div>
      <p className={`mt-3 text-[28px] leading-tight font-medium tracking-[-0.7px] tabular-nums ${toneClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-3">{sub}</p> : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg border border-line bg-raised">
        <Icon name={icon} className="size-5 text-ink-3" />
      </span>
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-3">{description}</p>
      {action}
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-canvas p-4 font-mono text-[11px] leading-relaxed text-ink-2">
      <code>{children}</code>
    </pre>
  );
}

export function Meter({ value, tone = "accent" }: { value: number; tone?: "accent" | "success" | "danger" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const bar = { accent: "bg-accent", success: "bg-ok", danger: "bg-bad" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
      <div className={`h-full rounded-pill ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
