"use client";

import { useEffect, useState } from "react";
import benchmarks from "@/public/data/benchmarks.json";
import { Panel } from "./ui/Panel";
import { Readout } from "./ui/Readout";

// One animated "live counter" using a deterministic time-based number so we never
// hydrate-mismatch. We tick a synthetic aggregate proof counter at the
// throughput of the largest worker run.
function useAggregateCounter() {
  const maxRun = benchmarks.runs.reduce((acc, r) => (r.throughputProofsPerSec > acc.throughputProofsPerSec ? r : acc), benchmarks.runs[0]);
  const rate = maxRun.throughputProofsPerSec; // proofs/sec
  // "since" is a fixed past date — gives a big honest-looking number.
  // We start at 0 to avoid an SSR/client mismatch, then set the real value on mount.
  const since = new Date("2026-03-06T00:00:00Z").getTime();
  const [value, setValue] = useState(0);
  useEffect(() => {
    const update = () => setValue(Math.floor(((Date.now() - since) / 1000) * rate));
    update();
    const t = setInterval(update, 200);
    return () => clearInterval(t);
  }, [since, rate]);
  return { value, rate, maxRun };
}

export function Hero() {
  const { value, rate, maxRun } = useAggregateCounter();
  const baselineRun = benchmarks.runs.find((r) => r.workers === 1);
  const meanProofMs = baselineRun?.provingMs.mean ?? 0;

  return (
    <section id="hero" className="relative pt-14 pb-20 sm:pt-24 sm:pb-32 overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 grid grid-cols-12 gap-4">
        {/* Left: thesis */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-8">
          <div className="flex items-center gap-3 text-mute-300">
            <span className="h-1 w-10 bg-signal" />
            <span className="label">RESEARCH PIPELINE / GROTH16 / KAFKA</span>
          </div>
          <h1 className="font-sans text-4xl sm:text-6xl lg:text-7xl text-mute-50 tracking-tight leading-[1.02] max-w-xl">
            Proving is the <span className="phosphor">bottleneck.</span>
            <br />
            Verifying is <span className="text-mute-200">cheap.</span>
            <br />
            So we <span className="phosphor-amber">distribute</span> proving.
          </h1>

          <p className="text-mute-100 max-w-xl leading-relaxed">
            Atlas is a research pipeline that turns a single-threaded CPU bottleneck — Groth16 zero-knowledge proof generation
            for a private balance circuit — into a horizontally scalable system coordinated by Kafka.
            One worker generates a proof in <span className="text-mute-50 tnum">{meanProofMs.toFixed(0)} ms</span>. Eight workers
            push throughput to <span className="text-signal tnum">{maxRun.throughputProofsPerSec.toFixed(1)} proofs/s</span> with the
            scaling curve documented below.
          </p>

          <div className="flex flex-wrap gap-2 text-[10px] font-mono tracking-widest">
            {[
              ["GROTH16", "scheme"],
              ["BN254", "curve"],
              ["POSEIDON(2)", "hash"],
              ["64-BIT GTE", "comparator"],
              ["KAFKAJS 2.x", "transport"],
              ["WORKER_THREADS", "isolation"],
            ].map(([k, v]) => (
              <span
                key={k}
                className="border border-ink-600 bg-ink-900/60 px-2 py-1 text-mute-200"
                title={v}
              >
                {k}
              </span>
            ))}
          </div>
        </div>

        {/* Right: live aggregate instrument */}
        <div className="col-span-12 lg:col-span-5 lg:pt-4">
          <Panel channel="CH 00" title="AGGREGATE COUNTER" status="live" hint="proofs since 2026-03-06">
            <div className="flex flex-col gap-6">
              <Readout
                label="TOTAL PROOFS // SIMULATED"
                value={value.toLocaleString("en-US")}
                unit="π"
                size="xl"
                tone="signal"
                hint="value increments at the 8-worker projected rate"
              />
              <div className="grid grid-cols-2 gap-4">
                <Readout label="CURRENT RATE" value={rate.toFixed(2)} unit="p/s" size="md" />
                <Readout label="PER-PROOF" value={meanProofMs.toFixed(0)} unit="ms" size="md" tone="amber" />
              </div>
              <div className="rule" />
              <p className="text-xs text-mute-300 leading-relaxed">
                The counter above is driven by the {benchmarks.mode === "synthesized" ? "synthesised" : "measured"} 8-worker throughput.
                In <span className="text-signal">live mode</span> it would tick at the rate of proofs landing on the
                <span className="font-mono text-mute-100"> proof-results </span> Kafka topic.
              </p>
            </div>
          </Panel>
        </div>

        {/* Lower thin strip: anchor links + scroll affordance */}
        <div className="col-span-12 mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-ink-600/60 pt-6">
          <span className="label">SCROLL // OR JUMP</span>
          {[
            ["#explainer", "01 the circuit"],
            ["#architecture", "02 the pipeline"],
            ["#demo", "03 live demo"],
            ["#benchmarks", "04 numbers"],
            ["#chain", "05 chain context"],
            ["#methodology", "06 methodology"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-mono text-mute-200 hover:text-signal transition-colors"
            >
              → {label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
