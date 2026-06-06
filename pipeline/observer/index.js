// Atlas lag observer — the autoscaler signal source.
//
// Every OBSERVE_INTERVAL ms, computes the total consumer-group lag for
// `proof-workers` on the `proof-jobs` topic:
//
//     lag = sum over partitions of (log-end-offset - committed-offset)
//
// and appends a JSONL record to observer-log.jsonl. Also tracks active
// workers (kafkajs `describeGroups`).
//
// For the 2-day build, the autoscaler itself is "phase 2 / future work" —
// scaling is manual (`docker compose up --scale worker=N`). This observer is
// the *signal*: it proves the lag time series exists, is sampleable, and is
// the right input to a future HPA-style controller.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kafka, logLevel } from "kafkajs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const TOPIC = process.env.OBSERVE_TOPIC ?? "proof-jobs";
const GROUP = process.env.OBSERVE_GROUP ?? "proof-workers";
const INTERVAL = parseInt(process.env.OBSERVE_INTERVAL ?? "2000", 10);
const LOG_FILE = path.resolve(process.env.OBSERVE_LOG ?? path.join(__dirname, "observer-log.jsonl"));

async function main() {
  console.log(`[observer] brokers=${BROKERS.join(",")} group=${GROUP} topic=${TOPIC} interval=${INTERVAL}ms log=${LOG_FILE}`);

  const kafka = new Kafka({ clientId: "lag-observer", brokers: BROKERS, logLevel: logLevel.WARN });
  const admin = kafka.admin();
  await admin.connect();

  const out = await fs.open(LOG_FILE, "a");
  let stopping = false;

  const shutdown = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`[observer] ${sig}, shutting down`);
    try {
      await out.close();
      await admin.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // poll loop
  while (!stopping) {
    const t0 = Date.now();
    try {
      const sample = await sampleOnce(admin);
      await out.write(JSON.stringify({ ts: t0, ...sample }) + "\n");
      console.log(
        `[observer] lag=${sample.lag} per-partition=[${sample.perPartition.join(",")}] activeWorkers=${sample.activeWorkers}`,
      );
    } catch (err) {
      console.error(`[observer] sample failed:`, err.message);
    }
    const dt = Date.now() - t0;
    await sleep(Math.max(0, INTERVAL - dt));
  }
}

async function sampleOnce(admin) {
  // log-end-offsets across all partitions of TOPIC
  const tops = await admin.fetchTopicOffsets(TOPIC);     // [{partition, offset, ...}]
  const ends = new Map(tops.map((t) => [t.partition, BigInt(t.offset)]));

  // committed offsets for GROUP
  let committed = [];
  try {
    committed = await admin.fetchOffsets({ groupId: GROUP, topics: [TOPIC] });
  } catch {
    committed = [];
  }
  const committedMap = new Map();
  for (const t of committed) {
    if (t.topic !== TOPIC) continue;
    for (const p of t.partitions) {
      committedMap.set(p.partition, BigInt(p.offset === "-1" ? "0" : p.offset));
    }
  }

  let lag = 0n;
  const perPartition = [];
  for (const [partition, endOffset] of [...ends.entries()].sort((a, b) => a[0] - b[0])) {
    const c = committedMap.get(partition) ?? 0n;
    const partLag = endOffset > c ? endOffset - c : 0n;
    lag += partLag;
    perPartition.push(Number(partLag));
  }

  // active workers in the group
  let activeWorkers = 0;
  try {
    const groups = await admin.describeGroups([GROUP]);
    activeWorkers = groups.groups[0]?.members?.length ?? 0;
  } catch {
    activeWorkers = 0;
  }

  return { topic: TOPIC, group: GROUP, lag: Number(lag), perPartition, activeWorkers };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("[observer] fatal:", err);
  process.exit(1);
});
