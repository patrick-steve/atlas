// aggregate.js — turn sweep.jsonl + observer-log.jsonl into benchmarks.json.
//
//   node aggregate.js --sweep runs/sweep.jsonl --observer ../observer/observer-log.jsonl --out ../../web/public/data/benchmarks.json
//
// Per worker count, computes:
//   throughputProofsPerSec    proofs / (max(completedAt) - min(enqueuedAt))
//   provingMs.{p50,p90,p99}   pure on-CPU proving time distribution
//   endToEndMs.{p50,p90,p99}  completedAt - enqueuedAt distribution
//   queueWaitMs.{p50,p90,p99} dequeuedAt - enqueuedAt distribution
//   speedup                   throughput(N) / throughput(1)
//   efficiency                speedup / N (1.0 = perfectly linear)
//
// Also extracts an observer time series sample for each run.

import path from "node:path";
import { promises as fs } from "node:fs";

function pctile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function dist(arr) {
  return { p50: pctile(arr, 50), p90: pctile(arr, 90), p99: pctile(arr, 99), mean: arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length), n: arr.length };
}

function parseArgs(argv) {
  const out = { sweep: "runs/sweep.jsonl", observer: "", out: "../../web/public/data/benchmarks.json", mode: "measured" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function readJsonl(p) {
  const text = await fs.readFile(p, "utf8");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = await readJsonl(path.resolve(args.sweep));
  const byWorker = new Map();
  for (const r of records) {
    if (!byWorker.has(r.workerCount)) byWorker.set(r.workerCount, []);
    byWorker.get(r.workerCount).push(r);
  }

  const runs = [];
  for (const [workerCount, rs] of [...byWorker.entries()].sort((a, b) => a[0] - b[0])) {
    const ok = rs.filter((r) => !r.error);
    const provingMs = ok.map((r) => r.perProofMs ?? r.durationMs);
    const endToEndMs = ok.map((r) => r.completedAt - r.enqueuedAt);
    const queueWaitMs = ok.map((r) => r.dequeuedAt - r.enqueuedAt);
    const t0 = Math.min(...ok.map((r) => r.enqueuedAt));
    const t1 = Math.max(...ok.map((r) => r.completedAt));
    const throughputProofsPerSec = ok.length / Math.max(1, (t1 - t0) / 1000);
    runs.push({
      workers: workerCount,
      n: ok.length,
      throughputProofsPerSec,
      provingMs: dist(provingMs),
      endToEndMs: dist(endToEndMs),
      queueWaitMs: dist(queueWaitMs),
      errors: rs.length - ok.length,
    });
  }
  const base = runs.find((r) => r.workers === 1)?.throughputProofsPerSec ?? runs[0]?.throughputProofsPerSec ?? 1;
  for (const r of runs) {
    r.speedup = r.throughputProofsPerSec / base;
    r.efficiency = r.speedup / r.workers;
  }

  let observerSamples = [];
  if (args.observer) {
    try {
      observerSamples = await readJsonl(path.resolve(args.observer));
    } catch {}
  }

  const out = {
    mode: args.mode,
    generatedAt: new Date().toISOString(),
    circuit: { name: "balance_proof", N: 64, constraints: 432, scheme: "groth16", curve: "bn128" },
    runs,
    observer: observerSamples,
  };
  await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await fs.writeFile(path.resolve(args.out), JSON.stringify(out, null, 2));
  console.log(`[aggregate] wrote ${path.resolve(args.out)}`);
  for (const r of runs) console.log(`  workers=${r.workers}  thr=${r.throughputProofsPerSec.toFixed(2)} p/s  speedup=${r.speedup.toFixed(2)}x  eff=${(r.efficiency * 100).toFixed(0)}%`);
}

main().catch((err) => { console.error("[aggregate] fatal:", err); process.exit(1); });
