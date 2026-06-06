import clsx from "clsx";

type Props = {
  label?: string;
  value: string | number;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "signal" | "amber" | "mute";
  hint?: string;
  className?: string;
};

const sizes = {
  sm: "text-xl",
  md: "text-3xl",
  lg: "text-5xl",
  xl: "text-6xl",
};

const tones = {
  signal: "phosphor",
  amber: "phosphor-amber",
  mute: "text-mute-50",
};

export function Readout({ label, value, unit, size = "md", tone = "signal", hint, className }: Props) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {label && (
        <div className="flex items-baseline gap-2">
          <span className="label">{label}</span>
          {hint && <span className="label text-mute-400">// {hint}</span>}
        </div>
      )}
      <div className={clsx("font-mono tnum leading-none", sizes[size], tones[tone])}>
        <span>{value}</span>
        {unit && (
          <span className="ml-2 text-sm font-mono text-mute-200 tracking-widest">{unit}</span>
        )}
      </div>
    </div>
  );
}
