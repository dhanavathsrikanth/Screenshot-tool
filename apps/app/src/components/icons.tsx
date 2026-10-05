const PATHS = {
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l4 4",
  panel: "M4 5h16v14H4zM9 5v14",
  chevron: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  play: "M8 5.5v13l10-6.5z",
  list: "M4 6h16M4 12h16M4 18h10",
  key: "M14 7a4 4 0 1 1-3.5 5.9L4 19v2h3v-2h2v-2h2l1.6-1.6A4 4 0 0 1 14 7z",
  chart: "M4 20h16M7 20v-6M12 20V8M17 20v-9",
  card: "M3 7h18v10H3zM3 11h18",
  book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM17 7h2v13H8",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6z",
  download: "M12 4v10m0 0 4-4m-4 4-4-4M4 18h16",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6 6 18",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  shield: "M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  alert: "M12 4 3 19h18zM12 10v4M12 16.5v.5",
  device: "M4 5h16v10H4zM9 19h6M12 15v4",
  crop: "M6 3v14a1 1 0 0 0 1 1h14M3 6h14a1 1 0 0 1 1 1v14",
  sliders: "M4 8h10M18 8h2M4 16h4M12 16h8M16 5v6M8 13v6",
  sparkles: "M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z",
  menu: "M4 7h16M4 12h16M4 17h16",
  logo: "M12 2 3 7v10l9 5 9-5V7z M12 7.5 7.5 10v4L12 16.5 16.5 14v-4z",
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: ReadonlySet<IconName> = new Set(["play", "logo"]);

export function Icon({
  name,
  className = "size-4",
  strokeWidth = 1.6,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  const path = PATHS[name];
  const filled = FILLED.has(name);

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path.split(" M").map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}
