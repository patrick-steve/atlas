"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Panel } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

// Synthetic animation timeline:
//   - jobs spawn from producer every ~150 ms
//   - each chooses a partition by its complexity hash
//   - each partition feeds exactly one worker (oversimplified for clarity)
//   - worker proves for "proofMs" then emits a result
//   - observer reads the partition queue depths
//
// All animation done in JS state — keeps it deterministic and avoids CSS
// animation conflicts when tabs go background.

type Job = {
  id: number;
  birthMs: number;
  partition: number;     // 0..N-1
  complexity: "low" | "high";
  bornFromProducer: number;
  arrivedAtPartition: number;
  pickedUpByWorker: number;
  completedAt: number;
};

const N_PARTITIONS = 4;          // shown as the 4 channels in the diagram
const WORKER_COUNT = 4;          // shown as 4 workers
const PROOF_MS_LOW = 1100;       // animation speeds — slowed down for readability
const PROOF_MS_HIGH = 2400;
const SPAWN_INTERVAL_MS = 320;

export function Architecture() {
  return (
    <section id="architecture" className="py-20 sm:py-28 border-t border-ink-600/40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeader
          index="02"
          kicker="PIPELINE :: PRODUCER → KAFKA → WORKER_THREADS → RESULTS"
          title="Why this looks like a streaming system, not an RPC service."
          lede="ZK proofs are CPU-bound and uneven. A request/response server stalls under bursts, and a thread-pool inside one process can't cross machines. Atlas treats every proof as a durable message on a partitioned queue, then lets a horizontally scalable pool of worker processes — each running snarkjs in its own worker_thread — drain the queue at the rate that hardware allows."
        />

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <Panel channel="DIAGRAM" title="LIVE TOPOLOGY // SYNTHETIC" status="live">
              <DiagramCanvas />
            </Panel>
          </div>
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <Panel channel="WHY_THREADS" title="EVENT-LOOP HAZARD" status="warn">
              <p className="text-sm text-mute-100 leading-relaxed">
                <span className="phosphor-amber">Trap:</span> snarkjs.groth16.fullProve pegs a CPU core for hundreds of milliseconds.
                If it ran on the same thread as the kafkajs consumer, missed heartbeats would trigger a partition rebalance
                <em> mid-proof</em>, and the result would land on a partition no one is consuming.
              </p>
              <p className="text-sm text-mute-100 mt-3 leading-relaxed">
                <span className="phosphor">Fix:</span> the consumer thread receives a job, hands it to a long-lived
                <span className="font-mono text-mute-50"> worker_thread</span> running the prover, and only commits the
                offset after the proof returns. Heartbeats keep flowing the whole time.
              </p>
            </Panel>

            <Panel channel="AUTOSCALER" title="LAG SIGNAL → SCALE TARGET" status="static">
              <p className="text-sm text-mute-100 leading-relaxed">
                The observer reads the consumer-group's <span className="font-mono text-mute-50">log-end − committed</span>
                {" "}offset every 2 s. That lag, divided by the current drain rate, gives "seconds to clear" — the natural
                input to an HPA-style controller.
              </p>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                In this 2-day build the autoscaler is manual (<span className="font-mono">docker compose up --scale worker=N</span>).
                The signal is plumbed; the controller is the next phase.
              </p>
            </Panel>
          </div>
        </div>

        {/* Topic anatomy strip */}
        <div className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12">
            <Panel channel="TOPICS" title="PROOF-JOBS // PROOF-RESULTS" status="static">
              <div className="grid grid-cols-12 gap-4 text-xs font-mono">
                <div className="col-span-12 sm:col-span-6">
                  <div className="label mb-2">PROOF-JOBS :: 8 PARTITIONS // KEY = COMPLEXITYCLASS</div>
                  <ul className="text-mute-100 space-y-1">
                    <li>→ partition key = <span className="text-mute-50">low | high</span></li>
                    <li>→ heavy and light traffic land on disjoint partitions, no head-of-line blocking</li>
                    <li>→ consumer group <span className="phosphor">proof-workers</span> rebalances across replicas</li>
                  </ul>
                </div>
                <div className="col-span-12 sm:col-span-6">
                  <div className="label mb-2">PROOF-RESULTS :: 4 PARTITIONS // KEY = JOBID</div>
                  <ul className="text-mute-100 space-y-1">
                    <li>→ partition key = <span className="text-mute-50">jobId</span>, preserving per-job ordering</li>
                    <li>→ gateway taps via its own consumer group (does <span className="text-amber">not</span> steal worker offsets)</li>
                    <li>→ retained 24h: enough for late /jobs/&lt;id&gt; polls and audit</li>
                  </ul>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagramCanvas() {
  const [tick, setTick] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const raf = (t: number) => {
      setTick(t);
      handle = requestAnimationFrame(raf);
    };
    let handle = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      const now = performance.now();
      const complexity: Job["complexity"] = Math.random() < 0.35 ? "high" : "low";
      const proofMs = complexity === "high" ? PROOF_MS_HIGH : PROOF_MS_LOW;
      const partition = pickPartition(complexity, nextId.current);
      const arriveAt = now + 700;       // 700ms to "fall" into Kafka
      const pickAt = arriveAt + 200 * Math.random();    // brief queue wait
      const completeAt = pickAt + proofMs;
      const job: Job = {
        id: nextId.current++,
        birthMs: now,
        partition,
        complexity,
        bornFromProducer: now,
        arrivedAtPartition: arriveAt,
        pickedUpByWorker: pickAt,
        completedAt: completeAt,
      };
      setJobs((j) => [...j, job].slice(-32));
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(i);
  }, []);

  // Compute live counts
  const now = tick;
  const inFlight = jobs.filter((j) => now < j.completedAt && now >= j.bornFromProducer);
  const completed = jobs.filter((j) => now >= j.completedAt).length;
  const queueDepthByPartition = Array.from({ length: N_PARTITIONS }, (_, idx) =>
    inFlight.filter((j) => j.partition === idx && now >= j.arrivedAtPartition && now < j.pickedUpByWorker).length,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header strip with live counts */}
      <div className="grid grid-cols-4 gap-3 font-mono text-xs">
        <Stat label="IN-FLIGHT" value={inFlight.length} tone="signal" />
        <Stat label="COMPLETED" value={completed} tone="signal" />
        <Stat label="HEAD-OF-QUEUE" value={Math.max(...queueDepthByPartition)} tone="amber" />
        <Stat label="WORKERS" value={WORKER_COUNT} />
      </div>

      <div className="relative w-full h-[420px] sm:h-[480px]" aria-label="Atlas pipeline animation">
        <svg viewBox="0 0 1000 480" className="w-full h-full" preserveAspectRatio="none">
          {/* faint background graticule */}
          <Graticule />

          {/* Lanes */}
          {Array.from({ length: N_PARTITIONS }).map((_, i) => (
            <Lane key={i} index={i} count={N_PARTITIONS} />
          ))}

          {/* Producer block (top-left) */}
          <Block x={20} y={20} w={140} h={60} title="PRODUCER" sub="--count N --complexity {low,high}" tone="amber" />

          {/* Kafka header */}
          <Block x={180} y={20} w={640} h={60} title="KAFKA :: proof-jobs" sub="8 partitions, key=complexityClass" tone="mute" />

          {/* Worker blocks */}
          {Array.from({ length: N_PARTITIONS }).map((_, i) => {
            const y = 110 + (i * 80);
            return (
              <g key={i}>
                <Block x={820} y={y} w={160} h={48} title={`WORKER #${i + 1}`} sub={"proof = worker_thread"} tone="signal" />
              </g>
            );
          })}

          {/* Results block (bottom-right) */}
          <Block x={820} y={440 - 20} w={160} h={40} title="proof-results" sub="" tone="mute" />

          {/* Job dots */}
          {jobs.map((j) => (
            <JobDot key={j.id} job={j} now={now} count={N_PARTITIONS} />
          ))}

          {/* Observer (left side, reading lag) */}
          <g>
            <line x1="22" y1="120" x2="22" y2="420" stroke="#252B37" strokeDasharray="2 4" />
            <Block x={20} y={420} w={140} h={50} title="OBSERVER" sub="lag = log-end − cmt" tone="mute" />
          </g>
        </svg>

        {/* Overlay legend */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-center gap-3 text-[10px] font-mono tracking-widest text-mute-300">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-signal" /> LOW (1 PROOF)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber" /> HIGH (4-PROOF BATCH)
          </span>
          <span className="text-mute-400 ml-auto">// ANIMATION SPEED 0.3× REAL</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "mute" }: { label: string; value: number; tone?: "signal" | "amber" | "mute" }) {
  const toneClass = tone === "signal" ? "phosphor" : tone === "amber" ? "phosphor-amber" : "text-mute-50";
  return (
    <div className="border border-ink-600 bg-ink-900/50 px-3 py-2">
      <div className="label">{label}</div>
      <div className={clsx("text-2xl tnum font-mono leading-none mt-1", toneClass)}>{value}</div>
    </div>
  );
}

function Block({
  x, y, w, h, title, sub, tone = "mute",
}: { x: number; y: number; w: number; h: number; title: string; sub: string; tone?: "signal" | "amber" | "mute" }) {
  const stroke = tone === "signal" ? "#7EE787" : tone === "amber" ? "#F2C055" : "#3F4654";
  const fill = "rgba(10,13,18,0.7)";
  const titleColor = tone === "signal" ? "#7EE787" : tone === "amber" ? "#F2C055" : "#B6BFCC";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1} />
      <line x1={x + 8} y1={y + 18} x2={x + w - 8} y2={y + 18} stroke="#1A1F29" strokeWidth={1} />
      <text x={x + 8} y={y + 14} fill={titleColor} fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2">
        {title}
      </text>
      {sub && (
        <text x={x + 8} y={y + 32} fill="#8893A4" fontFamily="JetBrains Mono" fontSize="9">
          {sub}
        </text>
      )}
    </g>
  );
}

function Lane({ index, count }: { index: number; count: number }) {
  const y = 110 + index * 80;
  return (
    <g>
      <line x1={160} y1={y + 24} x2={820} y2={y + 24} stroke="#1A1F29" strokeWidth={1} strokeDasharray="2 4" />
      <text x={170} y={y + 16} fill="#5E6675" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
        PART. {index}{index === 0 ? " · low" : index === count - 1 ? " · high" : ""}
      </text>
    </g>
  );
}

function Graticule() {
  const verticals = Array.from({ length: 11 }, (_, i) => 100 * i);
  const horizontals = Array.from({ length: 7 }, (_, i) => 80 * i);
  return (
    <g opacity={0.4}>
      {verticals.map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={480} stroke="#10141B" strokeWidth={1} />
      ))}
      {horizontals.map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#10141B" strokeWidth={1} />
      ))}
    </g>
  );
}

function pickPartition(complexity: Job["complexity"], id: number) {
  if (complexity === "low") return id % 2;          // partitions 0,1
  return 2 + (id % 2);                                // partitions 2,3
}

function JobDot({ job, now, count }: { job: Job; now: number; count: number }) {
  const t = now;
  const startX = 90;
  const endX = 900;
  const laneY = 110 + job.partition * 80 + 24;

  let x = startX;
  let y = 50;
  let opacity = 1;

  if (t < job.bornFromProducer) return null;

  if (t < job.arrivedAtPartition) {
    const p = (t - job.bornFromProducer) / (job.arrivedAtPartition - job.bornFromProducer);
    x = 90 + p * 110;
    y = 50 + p * (laneY - 50);
  } else if (t < job.pickedUpByWorker) {
    // sit in lane queue
    x = 200 + (t - job.arrivedAtPartition) * 0.05;
    y = laneY;
  } else if (t < job.completedAt) {
    const p = (t - job.pickedUpByWorker) / (job.completedAt - job.pickedUpByWorker);
    x = 220 + p * (endX - 220);
    y = laneY;
  } else {
    // fly down to results
    const p = Math.min(1, (t - job.completedAt) / 600);
    x = endX + p * 20;
    y = laneY + p * (440 - laneY);
    opacity = 1 - p;
    if (p >= 1) return null;
  }

  const isHigh = job.complexity === "high";
  return (
    <g opacity={opacity}>
      <circle cx={x} cy={y} r={isHigh ? 7 : 5} fill={isHigh ? "#F2C055" : "#7EE787"} opacity={0.85} />
      <circle cx={x} cy={y} r={isHigh ? 14 : 10} fill="none" stroke={isHigh ? "#F2C055" : "#7EE787"} strokeOpacity={0.25} />
    </g>
  );
}
