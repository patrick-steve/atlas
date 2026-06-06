// Atlas proof worker — Kafka consumer that delegates proving to a worker_thread.
//
// One process = one logical worker, processing one job at a time (one CPU core).
// Scale by running more replicas (`docker compose up --scale worker=N`).

import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Kafka, logLevel } from "kafkajs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const WORKER_GROUP = process.env.WORKER_GROUP ?? "proof-workers";
const WORKER_ID = process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`;
const BUILD_DIR = process.env.BUILD_DIR ?? path.resolve(__dirname, "build");
const JOBS_TOPIC = "proof-jobs";
const RESULTS_TOPIC = "proof-results";

const kafka = new Kafka({
  clientId: `worker-${WORKER_ID}`,
  brokers: BROKERS,
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 300, retries: 12 },
});

// One persistent worker_thread per process — booting snarkjs + Poseidon is expensive.
function spawnProver() {
  const w = new Worker(path.join(__dirname, "prover.worker.js"), {
    workerData: { buildDir: BUILD_DIR },
  });
  const pending = new Map();
  let nextId = 1;
  w.on("message", (msg) => {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.type === "result") entry.resolve(msg.result);
    else if (msg.type === "error") entry.reject(new Error(msg.error.message));
  });
  w.on("error", (err) => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  });
  const ready = new Promise((resolve) => {
    const onReady = (msg) => {
      if (msg?.type === "ready") {
        w.off("message", onReady);
        resolve();
      }
    };
    w.on("message", onReady);
  });
  return {
    ready,
    prove(job) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ type: "job", id, job });
      });
    },
  };
}

async function main() {
  console.log(`[worker ${WORKER_ID}] starting (brokers=${BROKERS.join(",")}, build=${BUILD_DIR})`);
  const prover = spawnProver();
  await prover.ready;
  console.log(`[worker ${WORKER_ID}] prover thread ready`);

  const consumer = kafka.consumer({
    groupId: WORKER_GROUP,
    sessionTimeout: 60_000,     // generous — proving may stall heartbeats briefly even with worker_threads
    heartbeatInterval: 5_000,
    maxWaitTimeInMs: 500,
  });
  const producer = kafka.producer({ allowAutoTopicCreation: false });

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: JOBS_TOPIC, fromBeginning: false });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message, partition }) => {
      const dequeuedAt = Date.now();
      let job;
      try {
        job = JSON.parse(message.value.toString());
      } catch (err) {
        console.error(`[worker ${WORKER_ID}] malformed job message`, err);
        return;
      }
      try {
        const result = await prover.prove(job);
        const completedAt = Date.now();
        // Send only the first proof + public signals over the wire — workers may
        // produce several proofs per batched job, but the gateway/demo only needs
        // one to display. We keep the full batch's aggregate timing for the
        // benchmark numbers.
        const first = result.proofs[0];
        await producer.send({
          topic: RESULTS_TOPIC,
          messages: [
            {
              key: String(result.jobId),
              value: JSON.stringify({
                jobId: result.jobId,
                complexityClass: job.complexityClass,
                batch: result.batch,
                workerId: WORKER_ID,
                partition,
                proof: first.proof,
                publicSignals: first.publicSignals,
                commitment: first.commitment,
                durationMs: result.durationMs,        // total proving time for the batch
                perProofMs: first.durationMs,         // headline per-proof number
                enqueuedAt: job.enqueuedAt,
                dequeuedAt,
                completedAt,
              }),
            },
          ],
        });
        console.log(
          `[worker ${WORKER_ID}] job=${job.jobId} part=${partition} batch=${result.batch} ${result.durationMs.toFixed(0)}ms`,
        );
      } catch (err) {
        console.error(`[worker ${WORKER_ID}] job=${job?.jobId} failed:`, err.message);
        // Still publish a failure marker so the gateway can complete the request.
        await producer
          .send({
            topic: RESULTS_TOPIC,
            messages: [
              {
                key: String(job?.jobId ?? "unknown"),
                value: JSON.stringify({
                  jobId: job?.jobId ?? null,
                  workerId: WORKER_ID,
                  partition,
                  error: err.message,
                  enqueuedAt: job?.enqueuedAt,
                  dequeuedAt,
                  completedAt: Date.now(),
                }),
              },
            ],
          })
          .catch(() => {});
      }
    },
  });

  const shutdown = async (sig) => {
    console.log(`[worker ${WORKER_ID}] ${sig}, shutting down`);
    try {
      await consumer.disconnect();
      await producer.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[worker ${WORKER_ID}] fatal:`, err);
  process.exit(1);
});
