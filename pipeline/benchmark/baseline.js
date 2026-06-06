// baseline.js — measure the real single-worker per-proof distribution
// on THIS machine, with NO Kafka in the loop.
//
//   node baseline.js --count 50 --batch 1 [--out runs/baseline.json]
//
// Calls snarkjs.groth16.fullProve N times back-to-back and records every
// per-proof duration. The output JSON is the ground truth for the
// distributed projections in synthesize.js.

import path from "node:path";
import { promises as fs } from "node:fs";
import { performance } from "node:perf_hooks";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS = path.resolve(__dirname, "..", "circuits", "build");
const WASM = path.join(CIRCUITS, "balance_proof_js", "balance_proof.wasm");
const ZKEY = path.join(CIRCUITS, "balance_proof.zkey");
const VKEY = path.join(CIRCUITS, "balance_proof.vkey.json");

function parseArgs(argv) {
  const out = { count: 50, batch: 1, out: path.join(__dirname, "runs", "baseline.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  out.count = parseInt(out.count, 10);
  out.batch = parseInt(out.batch, 10);
  return out;
}

function randBig(bits) {
  const bytes = crypto.randomBytes(Math.ceil(bits / 8));
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v & ((1n << BigInt(bits)) - 1n);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[baseline] count=${args.count} batch=${args.batch}`);

  const poseidon = await buildPoseidon();
  const vkey = JSON.parse(await fs.readFile(VKEY, "utf8"));

  // Warm up — first proof loads wasm + zkey into memory; not representative.
  await snarkjs.groth16.fullProve(await mkInput(poseidon), WASM, ZKEY);
  console.log("[baseline] warmup done");

  const durations = [];
  const wallStart = performance.now();

  for (let i = 0; i < args.count; i++) {
    const totalT0 = performance.now();
    for (let b = 0; b < args.batch; b++) {
      const inputs = await mkInput(poseidon);
      const t0 = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);
      const dur = performance.now() - t0;
      durations.push(dur);
      // sanity-check the first few
      if (i < 2 && b === 0) {
        const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        if (!ok) throw new Error("baseline self-verify failed");
      }
    }
    if ((i + 1) % 10 === 0) {
      const last = durations.slice(-args.batch * 10);
      const avg = last.reduce((a, b) => a + b, 0) / last.length;
      console.log(`[baseline] ${i + 1}/${args.count}  recent-avg=${avg.toFixed(1)}ms`);
    }
  }

  const wallMs = performance.now() - wallStart;
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const result = {
    machine: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: (await import("node:os")).cpus().map((c) => ({ model: c.model, speedMHz: c.speed })),
      collectedAt: new Date().toISOString(),
    },
    circuit: { name: "balance_proof", N: 64, constraints: 432 },
    workload: { count: args.count, batch: args.batch },
    durations,
    summary: {
      n: durations.length,
      meanMs: sum / durations.length,
      p50Ms: sorted[Math.floor(0.5 * sorted.length)],
      p90Ms: sorted[Math.floor(0.9 * sorted.length)],
      p99Ms: sorted[Math.floor(0.99 * sorted.length)],
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      wallClockMs: wallMs,
      throughputProofsPerSec: durations.length / (wallMs / 1000),
    },
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(result, null, 2));
  console.log(`[baseline] wrote ${args.out}`);
  console.log(`[baseline] mean=${result.summary.meanMs.toFixed(1)}ms  p50=${result.summary.p50Ms.toFixed(0)}ms  p99=${result.summary.p99Ms.toFixed(0)}ms  throughput=${result.summary.throughputProofsPerSec.toFixed(2)} p/s`);
}

async function mkInput(poseidon) {
  const balance = randBig(60) + 1n;
  const salt = randBig(64);
  const amount = randBig(40);
  const h = poseidon([balance, salt]);
  return {
    balance: balance.toString(),
    salt: salt.toString(),
    amount: amount.toString(),
    commitment: poseidon.F.toString(h),
  };
}

main().catch((err) => {
  console.error("[baseline] fatal:", err);
  process.exit(1);
});
