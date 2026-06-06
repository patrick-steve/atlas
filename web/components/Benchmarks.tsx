"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import benchmarks from "@/public/data/benchmarks.json";
import { Panel } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

// Stable palette aliased to the Tailwind theme — Recharts wants real hex.
const COLORS = {
  signal: "#7EE787",
  signalDim: "#3FA948",
  amber: "#F2C055",
  amberDim: "#A77C24",
  ink: "#10141B",
  grid: "#1A1F29",
  text: "#8893A4",
  textDim: "#5E6675",
};

type Metric = "throughputProofsPerSec" | "endToEndMs" | "queueWaitMs" | "provingMs";

export function Benchmarks() {
  const [metric, setMetric] = useState<Metric>("throughputProofsPerSec");

  const runs = benchmarks.runs;
  const observerSamples = benchmarks.observer as Record<string, { tSec: number; lag: number; activeWorkers: number }[]>;
  const [observerN, setObserverN] = useState<keyof typeof observerSamples>("4" as never);

  const speedupData = useMemo(
    () => runs.map((r) => ({
      workers: r.workers,
      speedup: r.speedup,
      ideal: r.workers,
      efficiency: r.efficiency,
    })),
    [runs],
  );

  const throughputData = useMemo(
    () => runs.map((r) => ({
      workers: r.workers,
      throughput: r.throughputProofsPerSec,
      eff: Math.round(r.efficiency * 100),
    })),
    [runs],
  );

  const latencyData = useMemo(
    () => runs.map((r) => ({
      workers: r.workers,
      p50_e2e: r.endToEndMs.p50,
      p90_e2e: r.endToEndMs.p90,
      p99_e2e: r.endToEndMs.p99,
      p50_q: r.queueWaitMs.p50,
      p90_q: r.queueWaitMs.p90,
      p99_q: r.queueWaitMs.p99,
      p50_p: r.provingMs.p50,
      p99_p: r.provingMs.p99,
    })),
    [runs],
  );

  return (
    <section id="benchmarks" className="py-20 sm:py-28 border-t border-ink-600/40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeader
          index="04"
          kicker={`BENCHMARKS :: ${benchmarks.mode.toUpperCase()} // N=${(runs[0]?.n ?? 200)} JOBS PER WORKER COUNT`}
          title="The shape of the speedup curve is the whole pitch."
          lede="Three views of the same workload, swept across 1, 2, 4, and 8 workers: throughput (proofs/sec), end-to-end latency distribution (queue wait plus proving), and the speedup curve vs the ideal linear scaling. Where the speedup line falls below the diagonal is where coordination overhead becomes visible."
        />

        {/* Top row: the money chart + a context strip */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <Panel channel="CH 01" title="SPEEDUP CURVE // T(N) ÷ T(1) vs IDEAL" status="static">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={speedupData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <defs>
                      <linearGradient id="speedupFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.signal} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COLORS.signal} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="2 4" />
                    <XAxis
                      dataKey="workers"
                      stroke={COLORS.text}
                      tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }}
                      label={{
                        value: "WORKERS (N)",
                        position: "insideBottom",
                        offset: -10,
                        fill: COLORS.textDim,
                        fontFamily: "JetBrains Mono",
                        fontSize: 10,
                        letterSpacing: 2,
                      }}
                    />
                    <YAxis
                      stroke={COLORS.text}
                      tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }}
                      domain={[0, "dataMax + 1"]}
                      label={{
                        value: "SPEEDUP ×",
                        angle: -90,
                        position: "insideLeft",
                        fill: COLORS.textDim,
                        fontFamily: "JetBrains Mono",
                        fontSize: 10,
                        letterSpacing: 2,
                      }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      formatter={(v: number, name) =>
                        name === "ideal" ? [`${v.toFixed(2)}×`, "Ideal (linear)"]
                          : name === "speedup" ? [`${v.toFixed(2)}×`, "Measured"]
                          : [v, name]
                      }
                    />
                    <Area type="monotone" dataKey="ideal" stroke={COLORS.amber} strokeDasharray="3 3" fill="none" />
                    <Area
                      type="monotone"
                      dataKey="speedup"
                      stroke={COLORS.signal}
                      strokeWidth={2}
                      fill="url(#speedupFill)"
                      dot={{ fill: COLORS.signal, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                {runs.map((r) => (
                  <div key={r.workers} className="border border-ink-600 bg-ink-900/50 px-3 py-2">
                    <div className="label">N = {r.workers}</div>
                    <div className="text-mute-50 tnum">{r.speedup.toFixed(2)}× speedup</div>
                    <div className="text-mute-300 tnum">eff {Math.round(r.efficiency * 100)}%</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <Panel channel="LEGEND" title="WHAT THIS PLOT IS SAYING" status="static">
              <div className="flex flex-col gap-3 text-sm text-mute-100 leading-relaxed">
                <p>
                  Dashed amber line — perfectly linear scaling. Doubling workers doubles throughput.
                  This is the theoretical ceiling for an embarrassingly parallel workload.
                </p>
                <p>
                  Solid signal line — the actual / projected throughput ratio. The gap between solid and dashed
                  is <span className="phosphor">coordination overhead</span>: kafkajs heartbeats, partition rebalances,
                  the gateway's WS fanout.
                </p>
                <p>
                  At <span className="text-mute-50">N = 8</span> the system runs at{" "}
                  <span className="phosphor tnum">
                    {Math.round((runs.find((r) => r.workers === 8)?.efficiency ?? 0) * 100)}% efficiency
                  </span>{" "}
                  — still well into the useful regime; the curve begins to flatten only as we approach the physical
                  core count of the host machine.
                </p>
              </div>
            </Panel>
            <Panel channel="MODEL" title="PROJECTION ASSUMPTIONS" status="static">
              <code className="block font-mono text-xs text-mute-100 leading-relaxed">
                T(N) = N · T(1) · η(N)<br />
                η(N) = 1 − α · (N − 1)<br />
                α = {benchmarks.model?.coordinationOverhead ?? 0.02}<br />
              </code>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                When the cluster is up, run.js replaces this projection with measured numbers and the chart re-renders.
                See METHODOLOGY.md for the full derivation.
              </p>
            </Panel>
          </div>
        </div>

        {/* Mid row: throughput bar + latency percentile bars */}
        <div className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12 lg:col-span-5">
            <Panel channel="CH 02" title="THROUGHPUT (PROOFS / SEC)" status="static">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={throughputData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="2 4" />
                    <XAxis dataKey="workers" stroke={COLORS.text} tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }} />
                    <YAxis stroke={COLORS.text} tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [`${v.toFixed(2)} p/s`, "throughput"]} />
                    <Bar dataKey="throughput" radius={[1, 1, 0, 0]}>
                      {throughputData.map((d, i) => (
                        <Cell key={i} fill={i === throughputData.length - 1 ? COLORS.signal : COLORS.signalDim} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <Panel
              channel="CH 03"
              title="LATENCY DISTRIBUTIONS // MS"
              status="static"
              hint="switch metric →"
            >
              <div className="flex flex-wrap gap-1 mb-3 text-[10px] font-mono tracking-widest">
                {([
                  ["endToEndMs", "END-TO-END"],
                  ["queueWaitMs", "QUEUE WAIT"],
                  ["provingMs", "PURE PROVING"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMetric(k as Metric)}
                    className={`px-2 py-1 border ${metric === k ? "border-signal/60 text-signal bg-signal/10" : "border-ink-600 text-mute-200 hover:text-mute-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="2 4" />
                    <XAxis dataKey="workers" stroke={COLORS.text} tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }} />
                    <YAxis stroke={COLORS.text} tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number, k) => [`${Math.round(v)} ms`, percentileLabel(k as string)]} />
                    <Bar dataKey={pctKey(metric, "p50")} fill={COLORS.signalDim} />
                    <Bar dataKey={pctKey(metric, "p90")} fill={COLORS.amber} />
                    <Bar dataKey={pctKey(metric, "p99")} fill={COLORS.signal} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs font-mono">
                <Swatch color={COLORS.signalDim} label="p50" />
                <Swatch color={COLORS.amber} label="p90" />
                <Swatch color={COLORS.signal} label="p99" />
              </div>
            </Panel>
          </div>
        </div>

        {/* Bottom: lag observer time series + raw run table */}
        <div className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12 lg:col-span-8">
            <Panel
              channel="CH 04"
              title="LAG OBSERVER // FILL → DRAIN"
              status="static"
              hint={`workers shown: ${observerN}`}
            >
              <div className="flex gap-1 mb-3 text-[10px] font-mono tracking-widest">
                {Object.keys(observerSamples).map((k) => (
                  <button
                    key={k}
                    onClick={() => setObserverN(k as never)}
                    className={`px-2 py-1 border ${observerN === k ? "border-signal/60 text-signal bg-signal/10" : "border-ink-600 text-mute-200"}`}
                  >
                    N = {k}
                  </button>
                ))}
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={observerSamples[observerN]} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="2 4" />
                    <XAxis
                      dataKey="tSec"
                      stroke={COLORS.text}
                      tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }}
                      label={{ value: "TIME (s)", position: "insideBottom", offset: -5, fill: COLORS.textDim, fontFamily: "JetBrains Mono", fontSize: 10 }}
                    />
                    <YAxis
                      stroke={COLORS.text}
                      tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: COLORS.text }}
                      label={{ value: "LAG (msgs)", angle: -90, position: "insideLeft", fill: COLORS.textDim, fontFamily: "JetBrains Mono", fontSize: 10 }}
                    />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [v, "lag"]} />
                    <ReferenceLine y={0} stroke={COLORS.textDim} />
                    <Line type="monotone" dataKey="lag" stroke={COLORS.signal} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                Producer fires the workload in a short burst; lag rises to ≈ 200 then drains at a slope proportional to
                <span className="font-mono text-mute-100"> N · T(1) · η(N)</span>. A real autoscaler would treat
                <span className="font-mono text-mute-100"> lag ÷ drain_rate</span> as "seconds to clear" and pick a target N.
              </p>
            </Panel>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Panel channel="TABLE" title="ALL RUNS // RAW" status="static">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-ink-600 text-mute-300">
                    <th className="text-left py-2">N</th>
                    <th className="text-right py-2">p/s</th>
                    <th className="text-right py-2">p99 e2e</th>
                    <th className="text-right py-2">eff</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.workers} className="border-b border-ink-600/50 last:border-b-0">
                      <td className="py-1.5 text-mute-50">{r.workers}</td>
                      <td className="py-1.5 text-right text-signal tnum">{r.throughputProofsPerSec.toFixed(1)}</td>
                      <td className="py-1.5 text-right text-mute-100 tnum">{Math.round(r.endToEndMs.p99)} ms</td>
                      <td className="py-1.5 text-right text-amber tnum">{Math.round(r.efficiency * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rule my-3" />
              <p className="text-xs text-mute-300 leading-relaxed">
                Click any data point in the charts for the exact value. Full per-job records live at
                <span className="font-mono text-mute-100"> pipeline/benchmark/runs/sweep.jsonl </span>
                when a real cluster sweep has been run.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function pctKey(metric: Metric, pct: "p50" | "p90" | "p99") {
  const tail = pct === "p50" ? "p50" : pct === "p90" ? "p90" : "p99";
  if (metric === "endToEndMs") return `${tail}_e2e`;
  if (metric === "queueWaitMs") return `${tail}_q`;
  return `${tail}_p`;
}

function percentileLabel(k: string) {
  if (k.startsWith("p50")) return "p50";
  if (k.startsWith("p90")) return "p90";
  if (k.startsWith("p99")) return "p99";
  return k;
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-mute-200">
      <span className="inline-block h-3 w-3" style={{ background: color }} />
      {label}
    </span>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "#0A0D12",
  border: "1px solid #252B37",
  fontFamily: "JetBrains Mono",
  fontSize: 12,
  color: "#D8DDE5",
};
const tooltipLabelStyle: React.CSSProperties = {
  color: "#8893A4",
  fontFamily: "JetBrains Mono",
  fontSize: 10,
  letterSpacing: 2,
};
