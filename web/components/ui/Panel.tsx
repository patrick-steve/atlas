import clsx from "clsx";

type Props = {
  channel?: string;
  title?: string;
  hint?: string;
  status?: "live" | "static" | "warn" | "off";
  className?: string;
  children: React.ReactNode;
};

const statusStyles: Record<NonNullable<Props["status"]>, string> = {
  live: "bg-signal animate-pulse-signal",
  static: "bg-mute-300",
  warn: "bg-amber",
  off: "bg-mute-400",
};

const statusLabel: Record<NonNullable<Props["status"]>, string> = {
  live: "LIVE",
  static: "STATIC",
  warn: "WARN",
  off: "OFF",
};

export function Panel({ channel, title, hint, status = "static", className, children }: Props) {
  return (
    <div
      className={clsx(
        "relative border border-ink-600/80 bg-ink-900/60 shadow-panel",
        "backdrop-blur-sm",
        className,
      )}
    >
      {(channel || title || status) && (
        <div className="flex items-center justify-between gap-3 border-b border-ink-600/60 px-3 py-2">
          <div className="flex items-baseline gap-3 min-w-0">
            {channel && <span className="label tracking-widest">{channel}</span>}
            {title && (
              <span className="truncate font-mono text-xs uppercase tracking-wider text-mute-100">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hint && <span className="label hidden sm:inline">{hint}</span>}
            <span className={clsx("h-1.5 w-1.5 rounded-full", statusStyles[status])} aria-hidden />
            <span className="label">{statusLabel[status]}</span>
          </div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
