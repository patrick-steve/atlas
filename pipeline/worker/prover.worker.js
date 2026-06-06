// worker_threads body — runs snarkjs.groth16.fullProve off the main event loop.
//
// CRITICAL — why this lives in a worker_thread, not the main consumer thread:
// snarkjs.groth16.fullProve pegs a CPU core for ~hundreds of milliseconds.
// If we ran it on the same thread as the kafkajs consumer, the consumer
// couldn't service its periodic heartbeat to the broker — the broker would
// eject this worker from `proof-workers`, trigger a partition rebalance, and
// the in-flight proof would silently land on a partition no one was consuming.
// Putting the prover in a worker_thread keeps the main loop responsive while
// the proof crunches.
//
// Receives jobs via parentPort, replies with the proof(s) and timing.
//
// A job with batch > 1 produces multiple proofs back-to-back in the same
// thread — modelling rollup / aggregate-proof workloads in which one logical
// "job" amortizes to several sequential proofs.

import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { promises as fs } from "node:fs";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const BUILD_DIR = workerData?.buildDir ?? process.env.BUILD_DIR ?? path.join(process.cwd(), "build");
const WASM = path.join(BUILD_DIR, "balance_proof.wasm");
const ZKEY = path.join(BUILD_DIR, "balance_proof.zkey");
const VKEY_PATH = path.join(BUILD_DIR, "balance_proof.vkey.json");

let poseidonPromise;
function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

let vkeyPromise;
function vkey() {
  if (!vkeyPromise) vkeyPromise = fs.readFile(VKEY_PATH, "utf8").then(JSON.parse);
  return vkeyPromise;
}

async function commit(balance, salt) {
  const p = await poseidon();
  return p.F.toString(p([BigInt(balance), BigInt(salt)]));
}

async function proveOne(inputs) {
  const commitment = inputs.commitment ?? (await commit(inputs.balance, inputs.salt));
  const fullInput = {
    balance: String(inputs.balance),
    salt: String(inputs.salt),
    amount: String(inputs.amount),
    commitment,
  };
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(fullInput, WASM, ZKEY);
  const durationMs = performance.now() - t0;
  return { proof, publicSignals, durationMs, commitment };
}

async function handle(job) {
  const batch = Math.max(1, job.batch ?? 1);
  const proofs = [];
  let totalProvingMs = 0;
  for (let i = 0; i < batch; i++) {
    // For batched ("high" complexity) jobs, we vary only the salt so each proof
    // is distinct without re-randomising the whole input (keeps the workload
    // shape comparable to a real rollup batch over related state).
    const inputs = i === 0
      ? job.inputs
      : { ...job.inputs, salt: (BigInt(job.inputs.salt) + BigInt(i)).toString(), commitment: undefined };
    const p = await proveOne(inputs);
    totalProvingMs += p.durationMs;
    proofs.push({ proof: p.proof, publicSignals: p.publicSignals, commitment: p.commitment, durationMs: p.durationMs });
  }

  // Self-verify the first proof so a malformed setup can never reach the gateway.
  const ok = await snarkjs.groth16.verify(await vkey(), proofs[0].publicSignals, proofs[0].proof);
  if (!ok) throw new Error(`local self-verify failed for job ${job.jobId}`);

  return {
    jobId: job.jobId,
    batch,
    proofs,
    durationMs: totalProvingMs,
  };
}

parentPort.on("message", async (msg) => {
  if (msg?.type !== "job") return;
  try {
    const result = await handle(msg.job);
    parentPort.postMessage({ type: "result", id: msg.id, result });
  } catch (err) {
    parentPort.postMessage({ type: "error", id: msg.id, error: { message: err.message, stack: err.stack } });
  }
});

parentPort.postMessage({ type: "ready" });
