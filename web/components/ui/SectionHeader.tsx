import clsx from "clsx";

type Props = {
  index: string;       // "I", "II" etc — section number
  kicker: string;      // "CH ≡ 02 :: SOLVENCY"
  title: string;
  lede?: string;
  className?: string;
};

export function SectionHeader({ index, kicker, title, lede, className }: Props) {
  return (
    <header className={clsx("grid grid-cols-12 gap-4 mb-8", className)}>
      <div className="col-span-12 sm:col-span-2 flex items-start gap-3">
        <span className="font-mono text-5xl text-mute-300/40 leading-none tnum">{index}</span>
        <div className="hidden sm:block w-px h-12 bg-ink-600 mt-1" />
      </div>
      <div className="col-span-12 sm:col-span-10 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="h-1 w-6 bg-signal" />
          <span className="label">{kicker}</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-medium text-mute-50 tracking-tight max-w-3xl">
          {title}
        </h2>
        {lede && (
          <p className="text-mute-100 max-w-2xl leading-relaxed">{lede}</p>
        )}
        <div className="rule" />
      </div>
    </header>
  );
}
