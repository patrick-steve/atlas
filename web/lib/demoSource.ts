// demoSource.ts — single interface the demo UI consumes.
//
// In LIVE mode: hit the local results gateway (NEXT_PUBLIC_GATEWAY_URL is set
// AND /health responds 200). Real Kafka, real workers, real proofs.
//
// In SIMULATED mode: sample the proving-time distribution from benchmarks.json
// to produce plausible "fake live" runs. The UI labels it Simulated so users
// can tell which they are watching.

import benchmarks from "@/public/data/benchmarks.json";

export type DemoEvent = {
  type: "submitted" | "queued" | "proving" | "verified" | "failed";
  jobId: string;
  at: number;
  // populated progressively
  commitment?: string;
  proof?: unknown;
  publicSignals?: unknown;
  durationMs?: number;
  queueWaitMs?: number;
  workerId?: string;
};

export type DemoInputs = {
  balance: string;
  salt: string;
  amount: string;
};

export type DemoMode = "live" | "simulated" | "probing";

const GATEWAY_URL =
  typeof window !== "undefined"
    ? (window as { NEXT_PUBLIC_GATEWAY_URL?: string }).NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL
    : process.env.NEXT_PUBLIC_GATEWAY_URL;

/** Probe gateway /health. Returns {ok:true, ...} or null. */
export async function probeGateway(): Promise<{ activeWorkers: number; lag: number | null } | null> {
  if (!GATEWAY_URL) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${GATEWAY_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return { activeWorkers: j.activeWorkers ?? 0, lag: j.lag ?? null };
  } catch {
    return null;
  }
}

/** Run a single demo job and yield progressive events. */
export async function* runDemo(
  inputs: DemoInputs,
  mode: DemoMode,
): AsyncGenerator<DemoEvent> {
  const jobId = `demo-${Math.random().toString(36).slice(2, 10)}`;
  yield { type: "submitted", jobId, at: Date.now() };

  if (mode === "live") {
    yield* runLive(jobId, inputs);
    return;
  }
  yield* runSimulated(jobId, inputs);
}

async function* runLive(jobId: string, inputs: DemoInputs): AsyncGenerator<DemoEvent> {
  if (!GATEWAY_URL) throw new Error("gateway not configured");
  const enqueuedAt = Date.now();
  const res = await fetch(`${GATEWAY_URL}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...inputs, complexityClass: "low" }),
  });
  if (!res.ok) throw new Error(`gateway POST /jobs failed: ${res.status}`);
  const { jobId: realJobId, commitment } = await res.json();
  yield { type: "queued", jobId: realJobId, at: Date.now(), commitment };

  // Poll /jobs/:id until done. The gateway also supports WS at /stream
  // but for one-shot demos polling is simpler & avoids holding a socket open.
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    await sleep(250);
    const r = await fetch(`${GATEWAY_URL}/jobs/${realJobId}`);
    if (r.status === 404) continue;
    const result = await r.json();
    if (result.error) {
      yield { type: "failed", jobId: realJobId, at: Date.now(), durationMs: result.durationMs };
      return;
    }
    yield {
      type: "proving",
      jobId: realJobId,
      at: Date.now(),
      durationMs: result.perProofMs ?? result.durationMs,
      workerId: result.workerId,
      queueWaitMs: (result.dequeuedAt ?? 0) - (result.enqueuedAt ?? enqueuedAt),
    };
    yield {
      type: "verified",
      jobId: realJobId,
      at: Date.now(),
      proof: result.proof,
      publicSignals: result.publicSignals,
      durationMs: result.perProofMs ?? result.durationMs,
      workerId: result.workerId,
      queueWaitMs: (result.dequeuedAt ?? 0) - (result.enqueuedAt ?? enqueuedAt),
    };
    return;
  }
  yield { type: "failed", jobId, at: Date.now() };
}

async function* runSimulated(jobId: string, _inputs: DemoInputs): AsyncGenerator<DemoEvent> {
  // sample proving time from the measured baseline distribution
  const baseline = benchmarks.runs.find((r) => r.workers === 1);
  const mean = baseline?.provingMs.mean ?? 180;
  const jitter = (Math.random() - 0.5) * 24;        // ±12 ms jitter
  const durationMs = Math.max(60, mean + jitter);

  const queueWaitMs = Math.random() * 80;            // tiny queue in single-machine demo
  await sleep(180 + queueWaitMs);                    // simulate enqueue+dequeue
  yield {
    type: "queued",
    jobId,
    at: Date.now(),
    commitment: stubCommitment(),
    queueWaitMs,
  };

  await sleep(durationMs);
  yield {
    type: "proving",
    jobId,
    at: Date.now(),
    durationMs,
    queueWaitMs,
    workerId: `simulated-${(Math.random() * 4 + 1) | 0}`,
  };

  await sleep(20);
  yield {
    type: "verified",
    jobId,
    at: Date.now(),
    proof: stubProof(),
    publicSignals: ["—", stubCommitment()],
    durationMs,
    queueWaitMs,
    workerId: `simulated-${(Math.random() * 4 + 1) | 0}`,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stubCommitment() {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stubProof() {
  return {
    pi_a: [stubCommitment(), stubCommitment(), "1"],
    pi_b: [[stubCommitment(), stubCommitment()], [stubCommitment(), stubCommitment()], ["1", "0"]],
    pi_c: [stubCommitment(), stubCommitment(), "1"],
    protocol: "groth16",
    curve: "bn128",
  };
}
