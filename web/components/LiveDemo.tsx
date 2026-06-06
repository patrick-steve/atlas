"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Panel } from "./ui/Panel";
import { Readout } from "./ui/Readout";
import { SectionHeader } from "./ui/SectionHeader";
import { type DemoEvent, type DemoMode, probeGateway, runDemo } from "@/lib/demoSource";

const STAGES = ["submitted", "queued", "proving", "verified"] as const;
type Stage = typeof STAGES[number];

export function LiveDemo() {
  const [balance, setBalance] = useState("12500");
  const [salt, setSalt] = useState("4242");
  const [amount, setAmount] = useState("7000");
  const [mode, setMode] = useState<DemoMode>("probing");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [stage, setStage] = useState<Stage>("submitted");
  const [gatewayInfo, setGatewayInfo] = useState<{ activeWorkers: number; lag: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    probeGateway().then((info) => {
      if (!alive) return;
      if (info) {
        setMode("live");
        setGatewayInfo(info);
      } else {
        setMode("simulated");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const onRun = async () => {
    if (running) return;
    if (BigInt(balance || "0") < BigInt(amount || "0")) {
      // The circuit would refuse — flag in UI.
      setEvents([{ type: "failed", jobId: "validation", at: Date.now() }]);
      return;
    }
    setRunning(true);
    setEvents([]);
    setStage("submitted");
    try {
      for await (const e of runDemo({ balance, salt, amount }, mode === "live" ? "live" : "simulated")) {
        setEvents((arr) => [...arr, e]);
        if ((STAGES as readonly string[]).includes(e.type)) setStage(e.type as Stage);
      }
    } catch (err) {
      setEvents((arr) => [...arr, { type: "failed", jobId: "demo-err", at: Date.now() }]);
    }
    setRunning(false);
  };

  const last = events[events.length - 1];
  const verified = last?.type === "verified";
  const failed = last?.type === "failed";

  return (
    <section id="demo" className="py-20 sm:py-28 border-t border-ink-600/40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeader
          index="03"
          kicker={`DEMO :: ${mode === "live" ? "LIVE // GATEWAY ONLINE" : mode === "probing" ? "PROBING…" : "SIMULATED // GATEWAY OFFLINE"}`}
          title="Submit one proof. Watch the pipeline."
          lede={mode === "live"
            ? "The local gateway responded, so this demo enqueues a real job to Kafka and a real worker_thread does the proving. The numbers below are measured."
            : "No gateway is reachable, so the demo draws timings from the measured baseline distribution. Honest about it — labelled SIMULATED throughout."}
        />

        <div className="grid grid-cols-12 gap-4">
          {/* Inputs */}
          <div className="col-span-12 lg:col-span-4">
            <Panel channel="CH 01" title="INPUTS // CLIENT" status="static">
              <div className="flex flex-col gap-4">
                <FieldInput label="BALANCE // PRIVATE" hint="held by client only" value={balance} onChange={setBalance} tone="amber" locked />
                <FieldInput label="SALT // PRIVATE" hint="random per commitment" value={salt} onChange={setSalt} tone="amber" locked />
                <FieldInput label="AMOUNT // PUBLIC" hint="claimed solvency floor" value={amount} onChange={setAmount} />
                <div className="rule" />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onRun}
                      disabled={running}
                      className={clsx(
                        "border px-4 py-2 font-mono text-sm uppercase tracking-widest transition-all",
                        running
                          ? "border-mute-400 text-mute-400 cursor-wait"
                          : "border-signal/60 text-signal hover:bg-signal/10 hover:shadow-glow",
                      )}
                    >
                      {running ? "PROVING…" : "▶ RUN PROOF"}
                    </button>
                    <span className="label">
                      MODE :: <span className={mode === "live" ? "text-signal" : "text-amber"}>{mode.toUpperCase()}</span>
                    </span>
                  </div>
                  {mode === "live" && gatewayInfo && (
                    <div className="font-mono text-xs text-mute-200">
                      gateway: <span className="text-signal">{gatewayInfo.activeWorkers}</span> worker(s),{" "}
                      lag <span className="text-mute-50 tnum">{gatewayInfo.lag ?? "—"}</span>
                    </div>
                  )}
                  {BigInt(balance || "0") < BigInt(amount || "0") && (
                    <div className="font-mono text-xs text-amber">
                      ⚠ amount &gt; balance — the circuit will refuse to produce a proof.
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </div>

          {/* Pipeline status */}
          <div className="col-span-12 lg:col-span-5">
            <Panel channel="CH 02" title="PIPELINE STATUS" status={running ? "live" : verified ? "static" : failed ? "warn" : "off"}>
              <div className="flex flex-col gap-5">
                <StageRail stage={stage} running={running} verified={verified} />
                <EventLog events={events} />
              </div>
            </Panel>
          </div>

          {/* Readouts */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
            <Panel channel="CH 03" title="LATENCY READOUTS" status={running ? "live" : "static"}>
              <div className="flex flex-col gap-4">
                <Readout
                  label="PROVING"
                  value={last?.durationMs ? last.durationMs.toFixed(0) : "—"}
                  unit="ms"
                  size="lg"
                  tone="signal"
                  hint="snarkjs.groth16.fullProve"
                />
                <Readout
                  label="QUEUE WAIT"
                  value={last?.queueWaitMs != null ? last.queueWaitMs.toFixed(0) : "—"}
                  unit="ms"
                  size="md"
                  tone="amber"
                  hint="dequeuedAt − enqueuedAt"
                />
                <Readout
                  label="WORKER"
                  value={last?.workerId ?? "—"}
                  size="sm"
                  tone="mute"
                  hint="processed by"
                />
              </div>
            </Panel>
            <Panel channel="CH 04" title="VERIFIER" status={verified ? "live" : failed ? "warn" : "off"}>
              <div className={clsx("font-mono text-xl", verified ? "phosphor" : failed ? "text-danger" : "text-mute-300")}>
                {verified ? "✓ ACCEPT" : failed ? "✗ REJECT" : "— STANDBY"}
              </div>
              <div className="text-xs text-mute-300 mt-2 leading-relaxed">
                {verified
                  ? "Verifier executed locally against the committed verification key. On-chain (Verifier.sol) is ~250k gas."
                  : failed
                  ? "Witness failed a constraint (likely amount > balance) OR the proof did not validate."
                  : "Verification result will appear here when a proof completes."}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageRail({ stage, running, verified }: { stage: Stage; running: boolean; verified: boolean }) {
  const reached = (s: Stage) => STAGES.indexOf(stage) >= STAGES.indexOf(s);
  return (
    <ol className="flex items-center gap-1 sm:gap-2">
      {STAGES.map((s, i) => (
        <li key={s} className="flex-1 flex items-center gap-1">
          <div
            className={clsx(
              "flex-1 border px-2 py-2 transition-all",
              reached(s)
                ? s === stage && running && !verified
                  ? "border-signal/80 bg-signal/15"
                  : "border-signal/40 bg-signal/5"
                : "border-ink-600 bg-ink-900/30",
            )}
          >
            <div
              className={clsx(
                "label",
                reached(s) ? "text-signal/80" : "text-mute-400",
              )}
            >
              {String(i + 1).padStart(2, "0")} // {s.toUpperCase()}
            </div>
          </div>
          {i < STAGES.length - 1 && (
            <span className={clsx("font-mono text-xs", reached(STAGES[i + 1]) ? "text-signal" : "text-mute-400")}>→</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function EventLog({ events }: { events: DemoEvent[] }) {
  return (
    <div className="border border-ink-600 bg-ink-900/40 max-h-56 overflow-auto">
      <table className="w-full text-xs font-mono">
        <thead className="text-mute-300 sticky top-0 bg-ink-900/95">
          <tr className="border-b border-ink-600">
            <th className="text-left px-3 py-1.5 font-normal">TS</th>
            <th className="text-left px-3 py-1.5 font-normal">EVENT</th>
            <th className="text-left px-3 py-1.5 font-normal">DETAILS</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-mute-400 px-3 py-4">
                — no events yet. Press <span className="phosphor">▶ RUN PROOF</span> to start.
              </td>
            </tr>
          ) : (
            events.map((e, i) => {
              const ts = new Date(e.at).toISOString().slice(11, 23);
              return (
                <tr key={i} className="border-b border-ink-600/40 last:border-b-0">
                  <td className="px-3 py-1.5 text-mute-300 tnum">{ts}</td>
                  <td className="px-3 py-1.5">
                    <span className={clsx(
                      "uppercase",
                      e.type === "verified" ? "phosphor" : e.type === "failed" ? "text-danger" : "text-mute-100",
                    )}>
                      {e.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-mute-200 truncate">
                    {e.commitment && `commit ${shortHex(e.commitment)}`}
                    {e.workerId && ` · worker ${e.workerId}`}
                    {e.durationMs != null && ` · ${e.durationMs.toFixed(0)} ms`}
                    {e.queueWaitMs != null && ` · qwait ${e.queueWaitMs.toFixed(0)} ms`}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function FieldInput({
  label, hint, value, onChange, tone = "mute", locked = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  tone?: "mute" | "amber" | "signal";
  locked?: boolean;
}) {
  const toneClass = tone === "amber" ? "text-amber" : tone === "signal" ? "text-signal" : "text-mute-50";
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label flex items-center gap-2">
          {locked && <span className="text-amber">⌧</span>}
          {label}
        </span>
        {hint && <span className="label text-mute-400">// {hint}</span>}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className={clsx(
          "bg-ink-950 border border-ink-600 px-3 py-2 font-mono tnum text-lg focus:outline-none focus:border-signal/70 focus:shadow-glow",
          toneClass,
        )}
        inputMode="numeric"
      />
    </label>
  );
}

function shortHex(s: string) {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
