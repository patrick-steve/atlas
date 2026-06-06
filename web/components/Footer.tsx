import { REPO_URL } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-ink-600/60 py-10 mt-10">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-3 text-mute-300">
          <span className="h-2 w-2 bg-signal animate-pulse-signal" aria-hidden />
          <span className="tracking-widest">ATLAS // DISTRIBUTED ZK PROVING // REV/0.1</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-mute-300">
          <a className="text-signal hover:underline" href={REPO_URL} target="_blank" rel="noreferrer">github / patrick-steve / atlas</a>
          <span className="text-mute-400">·</span>
          <a className="hover:text-signal transition-colors" href="https://github.com/iden3/circom" target="_blank" rel="noreferrer">circom</a>
          <a className="hover:text-signal transition-colors" href="https://github.com/iden3/snarkjs" target="_blank" rel="noreferrer">snarkjs</a>
          <a className="hover:text-signal transition-colors" href="https://kafka.js.org" target="_blank" rel="noreferrer">kafkajs</a>
          <span className="text-mute-400">·</span>
          <span className="tracking-widest">VERIFICATION IS CHEAP</span>
        </div>
      </div>
    </footer>
  );
}
