// Atlas proof-job producer.
//
// Usage:
//   node index.js --count 200 --complexity low
//   node index.js --count 200 --complexity high --batch 4
//   node index.js --count 50  --complexity mixed   # 50% low, 50% high
//
// Produces messages to the `proof-jobs` topic.
//
// Each message body:
//   {
//     jobId, complexityClass: "low"|"high",
//     inputs: { balance, salt, amount, commitment },
//     batch: N,           // how many proofs the worker should produce in this job
//     enqueuedAt: <epoch ms>
//   }
//
// Partition key = complexityClass so heavy jobs distribute predictably across
// the topic's partitions and one slow class can't starve the other.

import crypto from "node:crypto";
import { Kafka, logLevel, Partitioners } from "kafkajs";
import { buildPoseidon } from "circomlibjs";

const BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const TOPIC = "proof-jobs";

const COMPLEXITY = {
  low: { batch: 1 },   // one proof per job — the baseline workload.
  high: { batch: 4 },  // four proofs per job — emulates aggregate/rollup work.
};

function parseArgs(argv) {
  const out = { count: 50, complexity: "low" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  out.count = parseInt(out.count, 10);
  if (out.batch != null) out.batch = parseInt(out.batch, 10);
  return out;
}

function randomBigInt(bits) {
  const bytes = crypto.randomBytes(Math.ceil(bits / 8));
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v & ((1n << BigInt(bits)) - 1n);
}

async function makeJobInputs(poseidon) {
  // Stay well inside the 64-bit range so the circuit's GreaterEqThan never overflows.
  const balance = randomBigInt(60) + 1n;
  const salt = randomBigInt(64);
  const amount = randomBigInt(40); // < 2^40, always <= balance for valid proofs
  const h = poseidon([balance, salt]);
  const commitment = poseidon.F.toString(h);
  return {
    balance: balance.toString(),
    salt: salt.toString(),
    amount: amount.toString(),
    commitment,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const N = args.count;
  const requested = args.complexity;
  console.log(`[producer] brokers=${BROKERS.join(",")} count=${N} complexity=${requested}`);

  const poseidon = await buildPoseidon();
  const kafka = new Kafka({ clientId: "producer", brokers: BROKERS, logLevel: logLevel.WARN });
  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    createPartitioner: Partitioners.LegacyPartitioner,
  });
  await producer.connect();

  const t0 = Date.now();
  const messages = [];
  for (let i = 0; i < N; i++) {
    const klass =
      requested === "mixed"
        ? (i % 2 === 0 ? "low" : "high")
        : requested;
    const inputs = await makeJobInputs(poseidon);
    const jobId = crypto.randomUUID();
    const batch = args.batch ?? COMPLEXITY[klass].batch;
    messages.push({
      key: klass,                   // partition key — heavy/light split predictably
      value: JSON.stringify({
        jobId,
        complexityClass: klass,
        batch,
        inputs,
        enqueuedAt: Date.now(),
      }),
    });
  }

  // Send in chunks of 100 — kafkajs batches internally but huge sends can stall the broker.
  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    await producer.send({ topic: TOPIC, messages: messages.slice(i, i + CHUNK) });
  }
  const dt = Date.now() - t0;
  console.log(`[producer] enqueued ${N} jobs in ${dt}ms (${(N / (dt / 1000)).toFixed(1)} jobs/s)`);
  await producer.disconnect();
}

main().catch((err) => {
  console.error("[producer] fatal:", err);
  process.exit(1);
});
