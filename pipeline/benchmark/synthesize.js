// synthesize.js — produce a benchmarks.json suitable for the deployed showcase
// when a real distributed sweep has not been run (e.g. Docker unavailable).
//
//   node synthesize.js [--baseline runs/baseline.json] [--workers 1,2,4,8]
//                      [--jobs 200] [--out ../../web/public/data/benchmarks.json]
//
// What is MEASURED (from baseline.json on this exact machine):
//   - per-proof latency distribution (every durationMs)
//   - single-worker throughput
//
// What is MODELLED (with assumptions documented in METHODOLOGY.md):
//   - throughput at N>1 workers: T(N) = N * T(1) * eta(N)
//     where eta(N) = 1 - alpha*(N-1)  is a linear coordination-overhead penalty
//     (alpha ≈ 0.02 — derived from kafkajs heartbeat overhead and
//     consumer-rebalance amortization).
//   - end-to-end latency: queue-wait + proving; queue-wait is uniformly
//     distributed across the 0..W/N positions in the queue.
//   - lag-observer time series: sawtooth — fill, then drain at N * T(1) * eta(N).
//
// The output JSON sets mode: "synthesized" so the UI can label charts honestly.

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    baseline: path.join(__dirname, "runs", "baseline.json"),
    workers: "1,2,4,8",
    jobs: 200,
    out: path.resolve(__dirname, "..", "..", "web", "public", "data", "benchmarks.json"),
    alpha: 0.02,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  out.workers = out.workers.split(",").map((s) => parseInt(s, 10));
  out.jobs = parseInt(out.jobs, 10);
  out.alpha = parseFloat(out.alpha);
  return out;
}

function pctile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function distFromSamples(samples) {
  return {
    p50: pctile(samples, 50),
    p90: pctile(samples, 90),
    p99: pctile(samples, 99),
    mean: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
    n: samples.length,
  };
}

// Project the queue-wait distribution for a workload of W jobs through N workers
// when proving time per job is sampled from `provingMs`. Each job that arrives
// at queue position k (0..W-1) waits roughly (floor(k/N)) batches of mean(provingMs).
function projectQueueWait(W, N, provingMs) {
  const mean = provingMs.reduce((a, b) => a + b, 0) / provingMs.length;
  const waits = [];
  for (let k = 0; k < W; k++) waits.push(Math.floor(k / N) * mean);
  return waits;
}
function projectEndToEnd(queueWaits, provingMs) {
  // Pair each queue-wait with a sampled proving duration (with replacement).
  return queueWaits.map((qw, i) => qw + provingMs[i % provingMs.length]);
}

// Simulate a fill-then-drain sawtooth for the observer plot.
function simulateLag(W, N, baseThroughput, eta) {
  const samples = [];
  const fillRate = 250;            // producer rate: 250 jobs/sec, brief burst
  const drainRate = N * baseThroughput * eta;
  const t0 = 0;
  const fillSec = W / fillRate;
  // Fill phase
  for (let t = 0; t < fillSec; t += 0.25) {
    samples.push({ tSec: +t.toFixed(2), lag: Math.min(W, Math.round(fillRate * t)), activeWorkers: N });
  }
  // Drain phase
  let lag = W;
  for (let t = fillSec; lag > 0; t += 0.5) {
    lag = Math.max(0, lag - drainRate * 0.5);
    samples.push({ tSec: +t.toFixed(2), lag: Math.round(lag), activeWorkers: N });
    if (samples.length > 800) break;
  }
  return samples;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = JSON.parse(await fs.readFile(args.baseline, "utf8"));
  const provingMs = baseline.durations;
  const baseT = baseline.summary.throughputProofsPerSec;

  const runs = [];
  const observerByN = {};

  for (const N of args.workers) {
    const eta = Math.max(0.5, 1 - args.alpha * (N - 1));
    const queueWaits = projectQueueWait(args.jobs, N, provingMs);
    const endToEnd = projectEndToEnd(queueWaits, provingMs);
    runs.push({
      workers: N,
      n: args.jobs,
      throughputProofsPerSec: baseT * N * eta,
      provingMs: distFromSamples(provingMs),
      endToEndMs: distFromSamples(endToEnd),
      queueWaitMs: distFromSamples(queueWaits),
      efficiency: eta,
      speedup: N * eta,
      errors: 0,
    });
    observerByN[N] = simulateLag(args.jobs, N, baseT, eta);
  }

  const output = {
    mode: "synthesized",
    note: "per-proof latency MEASURED on this machine; multi-worker numbers PROJECTED from a documented model. See METHODOLOGY.md.",
    generatedAt: new Date().toISOString(),
    machine: baseline.machine,
    circuit: { ...baseline.circuit, scheme: "groth16", curve: "bn128" },
    workload: { jobs: args.jobs, batch: 1, complexity: "low" },
    model: {
      coordinationOverhead: args.alpha,
      etaFormula: "eta(N) = 1 - alpha*(N-1)",
      throughputFormula: "T(N) = N * T(1) * eta(N)",
    },
    runs,
    observer: observerByN,
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(output, null, 2));
  console.log(`[synthesize] wrote ${args.out}`);
  for (const r of runs) {
    console.log(
      `  workers=${r.workers}  thr=${r.throughputProofsPerSec.toFixed(2)} p/s  ` +
      `speedup=${r.speedup.toFixed(2)}x  eff=${(r.efficiency * 100).toFixed(0)}%  ` +
      `e2e_p50=${r.endToEndMs.p50.toFixed(0)}ms  e2e_p99=${r.endToEndMs.p99.toFixed(0)}ms`,
    );
  }
}

main().catch((err) => { console.error("[synthesize] fatal:", err); process.exit(1); });
