// run.js — orchestrate a benchmark sweep across worker counts.
//
//   node run.js --workers 1,2,4,8 --jobs 200 --complexity low [--out runs/sweep.jsonl]
//
// For each worker count:
//   1) docker compose up --scale worker=N -d
//   2) wait for `proof-workers` group to stabilize at N members
//   3) reset consumer-group offsets on `proof-jobs` (clean slate per run)
//   4) start an observer + a results-sink in parallel
//   5) producer fires `jobs` messages
//   6) wait for all results, then capture every per-job record
//   7) tear down and continue
//
// Output is a JSONL stream; each line is one (workerCount, jobId) record:
//   { workerCount, jobId, complexityClass, batch, durationMs, perProofMs,
//     enqueuedAt, dequeuedAt, completedAt, workerId, partition }
//
// aggregate.js consumes that stream and writes benchmarks.json for the web.

import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Kafka, logLevel, Partitioners } from "kafkajs";
import { buildPoseidon } from "circomlibjs";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_DIR = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    workers: "1,2,4,8",
    jobs: 200,
    complexity: "low",
    out: path.join(__dirname, "runs", "sweep.jsonl"),
    settleMs: 5000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  out.workers = out.workers.split(",").map((s) => parseInt(s, 10));
  out.jobs = parseInt(out.jobs, 10);
  out.settleMs = parseInt(out.settleMs, 10);
  return out;
}

function dc(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", ["compose", ...args], { cwd: COMPOSE_DIR, stdio: "inherit", shell: process.platform === "win32", ...opts });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`docker compose ${args.join(" ")} exit ${c}`))));
    p.on("error", reject);
  });
}

async function waitForWorkers(admin, expected, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const g = await admin.describeGroups(["proof-workers"]);
      const n = g.groups[0]?.members?.length ?? 0;
      if (n === expected) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`workers did not stabilize at ${expected}`);
}

async function resetOffsets(admin) {
  try {
    await admin.resetOffsets({ groupId: "proof-workers", topic: "proof-jobs", earliest: false });
  } catch (e) {
    console.warn(`[run] resetOffsets failed: ${e.message}`);
  }
}

function randBig(bits) {
  const bytes = crypto.randomBytes(Math.ceil(bits / 8));
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v & ((1n << BigInt(bits)) - 1n);
}

async function makeInputs(poseidon) {
  const balance = randBig(60) + 1n;
  const salt = randBig(64);
  const amount = randBig(40);
  return {
    balance: balance.toString(),
    salt: salt.toString(),
    amount: amount.toString(),
    commitment: poseidon.F.toString(poseidon([balance, salt])),
  };
}

async function runOne(workerCount, args, outFh) {
  console.log(`[run] === workers=${workerCount} ===`);
  await dc(["up", "-d", "--scale", `worker=${workerCount}`]);

  const kafka = new Kafka({ clientId: "bench-orchestrator", brokers: ["localhost:9092"], logLevel: logLevel.WARN });
  const admin = kafka.admin();
  const producer = kafka.producer({ allowAutoTopicCreation: false, createPartitioner: Partitioners.LegacyPartitioner });
  const consumer = kafka.consumer({ groupId: `bench-sink-${crypto.randomBytes(3).toString("hex")}` });
  await admin.connect(); await producer.connect(); await consumer.connect();
  await consumer.subscribe({ topic: "proof-results", fromBeginning: false });

  await waitForWorkers(admin, workerCount);
  await sleep(args.settleMs);
  await resetOffsets(admin);

  const poseidon = await buildPoseidon();
  const expected = args.jobs;
  let received = 0;
  const doneP = new Promise((resolve) => {
    consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        const r = JSON.parse(message.value.toString());
        await outFh.write(JSON.stringify({ workerCount, ...r }) + "\n");
        received++;
        if (received >= expected) resolve();
      },
    });
  });

  console.log(`[run] firing ${expected} jobs (${args.complexity})`);
  const fireT0 = Date.now();
  const CHUNK = 100;
  for (let i = 0; i < expected; i += CHUNK) {
    const messages = [];
    for (let j = i; j < Math.min(expected, i + CHUNK); j++) {
      const inputs = await makeInputs(poseidon);
      messages.push({
        key: args.complexity,
        value: JSON.stringify({
          jobId: crypto.randomUUID(),
          complexityClass: args.complexity,
          batch: args.complexity === "high" ? 4 : 1,
          inputs,
          enqueuedAt: Date.now(),
        }),
      });
    }
    await producer.send({ topic: "proof-jobs", messages });
  }
  console.log(`[run] all jobs sent in ${Date.now() - fireT0}ms; waiting for results...`);

  await doneP;
  console.log(`[run] received ${received} results; tearing down workers`);

  await consumer.disconnect(); await producer.disconnect(); await admin.disconnect();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[run] sweep: workers=${args.workers.join(",")} jobs=${args.jobs} complexity=${args.complexity}`);
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  const fh = await fs.open(args.out, "w");
  try {
    await dc(["up", "-d", "kafka", "topics-init"]);
    for (const n of args.workers) await runOne(n, args, fh);
  } finally {
    await fh.close();
    await dc(["down"]);
  }
  console.log(`[run] sweep complete → ${args.out}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => { console.error("[run] fatal:", err); process.exit(1); });
