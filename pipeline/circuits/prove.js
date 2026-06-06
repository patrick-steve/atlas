#!/usr/bin/env node
// prove.js — generate a Groth16 proof for balance_proof and verify it.
//
//   node prove.js                       # random valid inputs, prints proof + duration
//   node prove.js --balance 100 --amount 40 --salt 12345
//   node prove.js --invalid             # balance < amount → witness should fail
//
// Exports proveBalance({balance, salt, amount}) for reuse by the worker pool.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, "build");

const WASM = path.join(build, "balance_proof_js", "balance_proof.wasm");
const ZKEY = path.join(build, "balance_proof.zkey");
const VKEY = path.join(build, "balance_proof.vkey.json");

let poseidonPromise;
function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

// Compute Poseidon(balance, salt) as a decimal string in the BN254 scalar field.
export async function commit(balance, salt) {
  const p = await poseidon();
  const hash = p([BigInt(balance), BigInt(salt)]);
  return p.F.toString(hash); // decimal string
}

export async function proveBalance({ balance, salt, amount, commitment }) {
  const c = commitment ?? (await commit(balance, salt));
  const input = {
    balance: String(balance),
    salt: String(salt),
    amount: String(amount),
    commitment: c,
  };
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const durationMs = performance.now() - t0;
  return { proof, publicSignals, durationMs, commitment: c };
}

export async function verifyBalance({ proof, publicSignals }) {
  const vkey = JSON.parse(await fs.readFile(VKEY, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

function parseArgs(argv) {
  const out = { invalid: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--invalid") out.invalid = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const balance = BigInt(args.balance ?? 1_000_000n);
  const salt = BigInt(args.salt ?? 424242n);
  // For --invalid, deliberately ask for more than the balance.
  const amount = BigInt(args.amount ?? (args.invalid ? balance + 1n : balance / 2n));

  console.log(`[prove] balance=${balance} amount=${amount} salt=${salt}`);

  try {
    const { proof, publicSignals, durationMs, commitment } = await proveBalance({
      balance,
      salt,
      amount,
    });
    console.log(`[prove] commitment = ${commitment}`);
    console.log(`[prove] publicSignals = ${JSON.stringify(publicSignals)}`);
    console.log(`[prove] proof generated in ${durationMs.toFixed(1)} ms`);

    const ok = await verifyBalance({ proof, publicSignals });
    console.log(`[verify] ${ok ? "OK" : "FAIL"}`);
    if (!ok) process.exit(1);
  } catch (err) {
    if (args.invalid) {
      console.log(`[prove] expected failure for invalid witness: ${err.message.split("\n")[0]}`);
      process.exit(0);
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith("prove.js")) {
  await main();
  process.exit(0);
}
