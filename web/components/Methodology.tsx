import benchmarks from "@/public/data/benchmarks.json";
import { Panel } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

export function Methodology() {
  const machine = (benchmarks as { machine?: { cpus?: { model?: string }[]; collectedAt?: string; platform?: string; nodeVersion?: string } }).machine;
  return (
    <section id="methodology" className="py-20 sm:py-28 border-t border-ink-600/40">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <SectionHeader
          index="06"
          kicker="METHODOLOGY :: HARDWARE / WORKLOAD / PROJECTION"
          title="The credibility layer."
          lede="Every absolute number on this page is reproducible. The committed methodology document defines the workload, the hardware, the model used for projections (when the cluster isn't live), and the threats to validity. You can run the same sweep locally and check our numbers."
        />

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7">
            <Panel channel="CH 01" title="MACHINE OF RECORD" status="static">
              <div className="grid grid-cols-12 gap-3 text-xs font-mono">
                <KV k="MACHINE" v={machine?.cpus?.[0]?.model ?? "—"} />
                <KV k="CORES" v={`${machine?.cpus?.length ?? "—"} logical`} />
                <KV k="OS" v={machine?.platform === "win32" ? "Windows 11" : (machine?.platform ?? "—")} />
                <KV k="NODE" v={machine?.nodeVersion ?? "—"} />
                <KV k="COLLECTED" v={machine?.collectedAt?.slice(0, 19).replace("T", " ") ?? "—"} />
                <KV k="MODE" v={benchmarks.mode} highlight />
              </div>
              <div className="rule my-3" />
              <p className="text-xs text-mute-300 leading-relaxed">
                Bigger machines move every absolute number proportionally. The <em>shape</em> of the speedup curve is what
                matters — it is the property of the system, not of the silicon underneath it.
              </p>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <Panel channel="CH 02" title="WHAT IS MEASURED vs MODELLED" status="static">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="border border-signal/30 bg-signal/5 px-3 py-3">
                  <div className="label text-signal/80">MEASURED</div>
                  <ul className="text-mute-100 text-xs mt-2 space-y-1 leading-relaxed">
                    <li>· per-proof latency distribution</li>
                    <li>· single-worker throughput</li>
                    <li>· circuit constraint count</li>
                    <li>· proving + self-verify wall time</li>
                  </ul>
                </div>
                <div className="border border-amber/30 bg-amber/5 px-3 py-3">
                  <div className="label text-amber">MODELLED</div>
                  <ul className="text-mute-100 text-xs mt-2 space-y-1 leading-relaxed">
                    <li>· T(N) for N &gt; 1 from the η(N) formula</li>
                    <li>· queue-wait distribution from FIFO assumption</li>
                    <li>· observer time series as fill/drain sawtooth</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                When run.js is executed against a live cluster, every "modelled" item above gets replaced with real
                measurements and the chart re-renders.
              </p>
            </Panel>
          </div>

          <div className="col-span-12">
            <Panel channel="CH 03" title="REPRODUCE LOCALLY" status="static">
              <div className="grid grid-cols-12 gap-4 text-xs font-mono">
                <div className="col-span-12 md:col-span-6">
                  <div className="label mb-2">SINGLE-WORKER BASELINE // NO DOCKER</div>
                  <pre className="bg-ink-950/60 border border-ink-600 px-3 py-3 overflow-x-auto leading-relaxed text-mute-100">
{`cd pipeline/circuits
npm install
npm run compile:balance
npm run setup:balance

cd ../benchmark
node baseline.js --count 50
node synthesize.js`}
                  </pre>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <div className="label mb-2">FULL CLUSTER SWEEP // DOCKER REQUIRED</div>
                  <pre className="bg-ink-950/60 border border-ink-600 px-3 py-3 overflow-x-auto leading-relaxed text-mute-100">
{`cd pipeline
docker compose up -d kafka topics-init

cd benchmark
node run.js --workers 1,2,4,8 --jobs 200
node aggregate.js \\
  --sweep runs/sweep.jsonl \\
  --out ../../web/public/data/benchmarks.json`}
                  </pre>
                </div>
              </div>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <Panel channel="CH 04" title="THREATS TO VALIDITY" status="warn">
              <ul className="text-sm text-mute-100 leading-relaxed space-y-2 list-['—']">
                <li className="pl-2">Thermal throttling on laptop CPUs is real over long sweeps; per-proof time creeps up.</li>
                <li className="pl-2">The first proof in every worker process is slower (wasm + zkey load) — baseline.js discards it; run.js does not, so live runs include that cost in the long tail.</li>
                <li className="pl-2">Worker count is set manually here; partition rebalances on scale-up cost a one-time settle delay.</li>
                <li className="pl-2">The Powers of Tau is a local dev ceremony. Real deployments would use a public, audited one — same numbers, different trust assumptions.</li>
              </ul>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <Panel channel="CH 05" title="FUTURE WORK" status="static">
              <ul className="text-sm text-mute-100 leading-relaxed space-y-2 list-['→']">
                <li className="pl-2"><span className="phosphor">Real autoscaler controller</span> consuming the lag signal we already plumb.</li>
                <li className="pl-2"><span className="phosphor">Plonk / Halo2 baselines</span> for comparison — different setup costs, different proving-time profile.</li>
                <li className="pl-2"><span className="phosphor">Nullifiers + Merkle membership</span> to turn solvency into a spendable balance.</li>
                <li className="pl-2"><span className="phosphor">k8s HPA</span> instead of <code>docker compose --scale</code>.</li>
                <li className="pl-2"><span className="phosphor">Real on-chain deploy</span> of the exported Verifier.sol with an end-to-end demo against a testnet.</li>
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function KV({ k, v, highlight = false }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="col-span-12 sm:col-span-6 flex items-baseline justify-between border-b border-ink-600/40 py-1.5">
      <span className="label">{k}</span>
      <span className={`tnum truncate ml-3 ${highlight ? "phosphor" : "text-mute-50"}`}>{v}</span>
    </div>
  );
}
