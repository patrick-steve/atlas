// Atlas results gateway — the single endpoint the web frontend talks to.
//
//   POST   /jobs         enqueue a proof job, returns {jobId}
//   GET    /jobs/:id     poll a specific result (for clients that can't WS)
//   GET    /health       {ok:true, activeWorkers, lag}
//   GET    /benchmarks   serves web/public/data/benchmarks.json (or a fallback)
//   GET    /metrics      Prometheus-style counters (proofs, errors, p50/p90/p99)
//   WS     /stream       push every proof-result to connected clients
//
// CORS allows the Vercel domain (and localhost). To put a remote Vercel site
// in "live" mode, expose this gateway via an https tunnel (ngrok/cloudflared)
// and set NEXT_PUBLIC_GATEWAY_URL accordingly.

import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Kafka, logLevel, Partitioners } from "kafkajs";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const PORT = parseInt(process.env.GATEWAY_PORT ?? "8080", 10);
const JOBS_TOPIC = "proof-jobs";
const RESULTS_TOPIC = "proof-results";
const GROUP = process.env.WORKER_GROUP ?? "proof-workers";
const BENCHMARKS_PATH = process.env.BENCHMARKS_PATH ?? path.resolve(__dirname, "../../web/public/data/benchmarks.json");

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001").split(",");

const kafka = new Kafka({ clientId: "gateway", brokers: BROKERS, logLevel: logLevel.WARN });
const admin = kafka.admin();
const producer = kafka.producer({
  allowAutoTopicCreation: false,
  createPartitioner: Partitioners.LegacyPartitioner,
});
const consumer = kafka.consumer({
  // Unique groupId per gateway instance — gateway is a TAP on results,
  // not a consumer of the worker job queue. Sharing GROUP would steal jobs.
  groupId: `gateway-${crypto.randomBytes(4).toString("hex")}`,
});

const recentResults = new Map();        // jobId -> result, last N
const RESULT_RETENTION = 1000;
const latencyWindow = [];               // rolling per-proof latency for /metrics
const LATENCY_WINDOW_SIZE = 500;
let proofsTotal = 0;
let errorsTotal = 0;

let poseidonPromise;
function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

const wsClients = new Set();

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function rememberResult(r) {
  recentResults.set(r.jobId, r);
  if (recentResults.size > RESULT_RETENTION) {
    const oldest = recentResults.keys().next().value;
    recentResults.delete(oldest);
  }
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}

function metricsSnapshot() {
  const sorted = [...latencyWindow].sort((a, b) => a - b);
  return {
    proofsTotal,
    errorsTotal,
    latencyMsP50: percentile(sorted, 50),
    latencyMsP90: percentile(sorted, 90),
    latencyMsP99: percentile(sorted, 99),
    sampleSize: sorted.length,
  };
}

async function lagSnapshot() {
  try {
    const tops = await admin.fetchTopicOffsets(JOBS_TOPIC);
    const ends = new Map(tops.map((t) => [t.partition, BigInt(t.offset)]));
    const committed = await admin.fetchOffsets({ groupId: GROUP, topics: [JOBS_TOPIC] });
    const cm = new Map();
    for (const t of committed) for (const p of t.partitions) cm.set(p.partition, BigInt(p.offset === "-1" ? "0" : p.offset));
    let lag = 0n;
    for (const [part, end] of ends) lag += (end - (cm.get(part) ?? 0n));
    return Number(lag);
  } catch {
    return null;
  }
}

async function activeWorkers() {
  try {
    const g = await admin.describeGroups([GROUP]);
    return g.groups[0]?.members?.length ?? 0;
  } catch {
    return 0;
  }
}

async function enqueueJob(body) {
  const { balance, salt, amount, complexityClass = "low", batch = 1, commitment } = body ?? {};
  if (balance == null || salt == null || amount == null) throw new Error("missing balance/salt/amount");
  const p = await poseidon();
  const c = commitment ?? p.F.toString(p([BigInt(balance), BigInt(salt)]));
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    complexityClass,
    batch: Math.max(1, Number(batch) | 0),
    inputs: { balance: String(balance), salt: String(salt), amount: String(amount), commitment: c },
    enqueuedAt: Date.now(),
  };
  await producer.send({
    topic: JOBS_TOPIC,
    messages: [{ key: complexityClass, value: JSON.stringify(job) }],
  });
  return { jobId, commitment: c, enqueuedAt: job.enqueuedAt };
}

async function startResultsTap() {
  await consumer.connect();
  await consumer.subscribe({ topic: RESULTS_TOPIC, fromBeginning: false });
  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message }) => {
      try {
        const r = JSON.parse(message.value.toString());
        if (r.error) {
          errorsTotal++;
        } else {
          proofsTotal++;
          if (typeof r.perProofMs === "number") {
            latencyWindow.push(r.perProofMs);
            if (latencyWindow.length > LATENCY_WINDOW_SIZE) latencyWindow.shift();
          }
        }
        rememberResult(r);
        broadcast({ type: "result", result: r });
      } catch (err) {
        console.error("[gateway] failed to parse result", err.message);
      }
    },
  });
}

async function main() {
  await admin.connect();
  await producer.connect();
  await startResultsTap();

  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) return cb(null, true);
        // Accept any *.vercel.app preview URL automatically.
        try {
          const u = new URL(origin);
          if (u.hostname.endsWith(".vercel.app")) return cb(null, true);
        } catch {}
        return cb(new Error("origin not allowed"));
      },
    }),
  );

  app.get("/health", async (_req, res) => {
    res.json({
      ok: true,
      activeWorkers: await activeWorkers(),
      lag: await lagSnapshot(),
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  app.get("/metrics", (_req, res) => res.json(metricsSnapshot()));

  app.post("/jobs", async (req, res) => {
    try {
      const { jobId, commitment, enqueuedAt } = await enqueueJob(req.body);
      res.json({ jobId, commitment, enqueuedAt });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/jobs/:id", (req, res) => {
    const r = recentResults.get(req.params.id);
    if (!r) return res.status(404).json({ error: "not found (yet)" });
    res.json(r);
  });

  app.get("/benchmarks", async (_req, res) => {
    try {
      const buf = await fs.readFile(BENCHMARKS_PATH);
      res.type("application/json").send(buf);
    } catch {
      res.status(404).json({ error: "benchmarks.json not generated yet" });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/stream" });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: "hello", proofsTotal, metrics: metricsSnapshot() }));
    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  server.listen(PORT, () => {
    console.log(`[gateway] http+ws on :${PORT}, brokers=${BROKERS.join(",")}`);
  });

  const shutdown = async (sig) => {
    console.log(`[gateway] ${sig}, shutting down`);
    try {
      await consumer.disconnect();
      await producer.disconnect();
      await admin.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});
