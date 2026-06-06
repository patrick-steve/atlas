#!/usr/bin/env node
// Phase 1 Groth16 setup pipeline.
//
//   node scripts/setup.js multiplier
//   node scripts/setup.js balance_proof
//
// Drives snarkjs CLI (more reliable than its JS API for ptau).
//   pot15_0000.ptau → contribute → preparePhase2 → pot15_final.ptau
//   .r1cs + pot → zkey_0 → contribute → zkey_final → vkey.json + Verifier.sol

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const build = path.join(root, "build");

const POT_POWER = 15; // 2^15 = 32768 constraints. balance_proof @ N=64 fits easily.

const SNARKJS = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "snarkjs.cmd" : "snarkjs");

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    // shell:true is required on Windows to invoke snarkjs.cmd.
    const p = spawn(SNARKJS, args, { stdio: "inherit", shell: true, ...opts });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`snarkjs ${args.join(" ")} exited ${code}`))));
  });
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function entropy() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ensurePot() {
  const final = path.join(build, `pot${POT_POWER}_final.ptau`);
  if (await exists(final)) {
    console.log(`[setup] reusing ${path.basename(final)}`);
    return final;
  }
  const p0 = path.join(build, `pot${POT_POWER}_0000.ptau`);
  const p1 = path.join(build, `pot${POT_POWER}_0001.ptau`);
  console.log(`[setup] Powers of Tau: new BN128 ceremony at 2^${POT_POWER}`);
  await run(["powersoftau", "new", "bn128", String(POT_POWER), p0, "-v"]);
  await run(["powersoftau", "contribute", p0, p1, "--name=atlas-dev", "-v", `-e=${entropy()}`]);
  await run(["powersoftau", "prepare", "phase2", p1, final, "-v"]);
  await fs.unlink(p0).catch(() => {});
  await fs.unlink(p1).catch(() => {});
  return final;
}

async function setupCircuit(name) {
  const r1cs = path.join(build, `${name}.r1cs`);
  if (!(await exists(r1cs))) {
    throw new Error(`Missing ${r1cs}. Compile the circuit first.`);
  }
  const pot = await ensurePot();

  const z0 = path.join(build, `${name}_0000.zkey`);
  const z1 = path.join(build, `${name}.zkey`);
  const vkey = path.join(build, `${name}.vkey.json`);

  console.log(`[setup] Groth16 phase 2 for ${name}`);
  await run(["groth16", "setup", r1cs, pot, z0]);
  await run(["zkey", "contribute", z0, z1, "--name=atlas-dev", "-v", `-e=${entropy()}`]);
  await run(["zkey", "export", "verificationkey", z1, vkey]);
  await fs.unlink(z0).catch(() => {});

  if (name === "balance_proof") {
    const sol = path.join(build, "Verifier.sol");
    await run(["zkey", "export", "solidityverifier", z1, sol]);
    console.log("[setup] wrote build/Verifier.sol");
  }

  console.log(`[setup] done → ${path.relative(root, z1)}`);
}

const which = process.argv[2];
if (!which || !["multiplier", "balance_proof"].includes(which)) {
  console.error("usage: node scripts/setup.js <multiplier|balance_proof>");
  process.exit(2);
}
await fs.mkdir(build, { recursive: true });
await setupCircuit(which);
