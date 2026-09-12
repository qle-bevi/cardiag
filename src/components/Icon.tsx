export type IconName =
  | "car"
  | "grid"
  | "engine"
  | "brake"
  | "airbag"
  | "gear"
  | "body"
  | "flask"
  | "plug"
  | "arrow"
  | "scan"
  | "trash"
  | "check"
  | "alert"
  | "chevron"
  | "close"
  | "minus"
  | "maximize"
  | "restore"
  | "shield";
const paths: Record<IconName, string> = {
  car: "M3 16v-5l3-6h12l3 6v5M3 11h18M6 16h12M6 16v3M18 16v3M6 14h2M16 14h2",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  engine: "M3 10v7h3l3 3h9v-4h3V9h-3V6H8v4H3ZM6 3h8M10 3v3M1 12v4",
  brake:
    "M7 3a10 10 0 0 0 0 18M17 3a10 10 0 0 1 0 18M12 8v5M12 16v.1M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  airbag:
    "M7 5a2 2 0 1 0 0 .1M7 10l3 5h6l3 5M5 10l2 8h6M19 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  gear: "M5 3v18M12 3v18M19 3v9H5M3 3h4M10 3h4M17 3h4M3 21h4M10 21h4",
  body: "M5 20V8l5-5h8l2 8v9H5ZM7 10h10l-1-5h-5l-4 5ZM14 14h3",
  flask: "M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10",
  plug: "M8 3v4M16 3v4M6 7h12v4a6 6 0 0 1-12 0V7ZM12 17v5",
  arrow: "M5 12h14M14 7l5 5-5 5",
  scan: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M4 12h16",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  check: "M5 12l4 4L19 6",
  alert: "M12 3 2 21h20L12 3ZM12 9v5M12 17v.1",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  minus: "M5 12h14",
  maximize: "M5 5h14v14H5z",
  restore: "M8 8V4h12v12h-4M4 8h12v12H4z",
  shield: "M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3ZM8 12l3 3 5-6",
};
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
