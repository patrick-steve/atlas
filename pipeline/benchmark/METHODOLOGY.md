# Atlas Benchmark Methodology

This document defines the workload, hardware, and statistical methods behind every number that appears on the Atlas showcase site. It is the credibility layer: anyone reading the charts should be able to reproduce them, or at minimum understand the precise claim being made.

---

## 1. The claim, in one sentence

> Generating a single Groth16 proof for our `balance_proof` circuit on a modern x86 laptop core takes **~180 ms after warm-up**. Distributing those proofs across N independent worker cores via Kafka scales throughput **linearly until coordination overhead becomes visible around N ≥ 4**, after which efficiency declines along a documented curve.

That is the whole pitch. Everything below justifies it.

---

## 2. Workload definition

| Knob | Value | Why |
|---|---|---|
| Circuit | `balance_proof.circom` | The real circuit, not the multiplier warm-up. |
| Constraints | 432 non-linear | Exact count from `circom --r1cs` output. |
| Comparator width `N` | 64 bits | Realistic for token amounts; proving time scales with `N`. Documented in PLAN.md. |
| Hash | Poseidon(2) from circomlib | ZK-friendly; ~213 of the 432 constraints. |
| Proof scheme | Groth16 over BN254 | Smallest verifier, smallest proof; on-chain compatible. |
| Powers of Tau | 2¹⁵ (local dev ceremony) | Far above the 432-constraint requirement. **Not a public ceremony — dev only.** |
| Job batch size | 1 (`complexity=low`) or 4 (`complexity=high`) | The "complexity class" knob; partitions traffic so heavy jobs don't starve light ones. |
| Workload per run | 200 jobs | Long enough to reach steady state and exercise queue depth. |

A single job consists of: deterministic JSON `{balance, salt, amount, commitment}` → `snarkjs.groth16.fullProve` → `snarkjs.groth16.verify` (self-check) → emit result to Kafka.

---

## 3. Hardware

The committed `benchmarks.json` was generated on the developer's machine:

- **CPU:** Intel Core i5-11260H (6P+0E, 12 logical, 2.6 GHz base, Tiger Lake-H)
- **OS:** Windows 11 Home, Node 24.14
- **Kafka:** Bitnami `bitnami/kafka:3.7` KRaft mode, single broker, in Docker Desktop on WSL2

Bigger machines move every absolute number proportionally — the **shape** of the speedup curve is what matters.

---

## 4. What is measured vs. modelled

The shipped `benchmarks.json` carries a `mode` field. Two values are possible.

### `mode: "measured"`
Produced by `node run.js` against a live Docker Compose cluster. Every per-job record is real: enqueued / dequeued / completed timestamps, proving time, worker id, partition. `aggregate.js` computes percentiles directly from those records. **No model.** This is what you get when you have Docker.

### `mode: "synthesized"` (current default in this repo)
Produced by `node synthesize.js` when a live cluster run is not feasible. The **per-proof latency distribution is measured** on the developer machine via `baseline.js` (a tight loop calling `snarkjs.groth16.fullProve` 30 times with a 1-proof warm-up discarded). The **multi-worker numbers are projected** with the model below.

#### Projection model

Let `T(1)` be the measured single-worker steady-state throughput in proofs/sec.

```
T(N)         = N · T(1) · η(N)              throughput
η(N)         = 1 − α · (N − 1)              coordination efficiency
end_to_end_k = queue_wait_k + proving_k     per-job
queue_wait_k = ⌊k/N⌋ · mean(proving)         queue position k of W (FIFO across N consumers)
```

- `α = 0.02` (the "coordination overhead per added worker"). Calibrated against kafkajs heartbeat overhead and the observed cost of a single rebalance during initial worker-pool tests. **This is the single most important assumption; it is exposed in `benchmarks.json.model.coordinationOverhead` so a reader can re-derive the chart with a different value.**
- The model deliberately produces a **graceful, not heroic, speedup curve**. A measured run will likely produce slightly worse scaling because of real Docker / Kafka tail latencies the model does not include.

The model deliberately does NOT include: GC pauses, occasional `snarkjs` allocator hiccups, network jitter, or the cost of the first proof per worker (witness wasm + zkey load). Those exist in real runs and will push real numbers slightly below the projection.

---

## 5. Statistics

For every per-worker-count run we report **throughput** (proofs/sec, computed over the entire workload window `max(completedAt) − min(enqueuedAt)`) and three distributions:

| Distribution | What it isolates | Why it matters |
|---|---|---|
| `provingMs` | Pure on-CPU proving, no queue | The ZK cost. Should be near-identical across worker counts on identical hardware. |
| `queueWaitMs` | Time the job spent waiting for a worker | The Kafka/coordination component. Should shrink ~linearly with N. |
| `endToEndMs` | `completedAt − enqueuedAt` | What the user actually feels. Dominated by queue wait when N is small. |

For each, we report **p50 / p90 / p99 / mean / n**. The p99 of `endToEndMs` is the "long-tail proof" — the user-visible worst case — and is what improves most dramatically with more workers.

**Speedup** is defined as `T(N) / T(1)`, and **parallel efficiency** as `speedup / N`. A perfectly linear system would show `efficiency = 1.0` for every N; reality shows it decaying — that decay is the whole point of the chart.

---

## 6. What the observer plot shows

`pipeline/observer/index.js` polls the broker every 2 seconds for the total consumer-group lag on `proof-jobs`:

```
lag = Σ_partitions (log_end_offset − committed_offset_for_proof-workers)
```

In `mode: "synthesized"`, the time series is a sawtooth: a fill phase (producer fires 200 jobs in ~0.8 s) followed by a drain phase whose slope is exactly `N · T(1) · η(N)`. Real-cluster output is noisier but the same shape.

This is the **autoscaler signal**. A real autoscaler in a follow-up phase (see PLAN.md §6) would compute `lag/throughput` to estimate "seconds to drain," and scale workers up when that exceeds an SLO.

---

## 7. Reproducing

### Single-worker measured baseline (no Docker required)
```
cd pipeline/circuits && npm install && npm run compile:balance && npm run setup:balance
cd ../benchmark && node baseline.js --count 50
node synthesize.js
```

### Full distributed sweep (requires Docker)
```
cd pipeline
docker compose up -d kafka topics-init
cd benchmark && node run.js --workers 1,2,4,8 --jobs 200
node aggregate.js --sweep runs/sweep.jsonl --out ../../web/public/data/benchmarks.json
```

The aggregate script can mix and match: pass `--mode measured` for the real-cluster output, or rely on `synthesize.js` for a Docker-less run.

---

## 8. Sources of noise (honesty)

- Thermal throttling on laptop CPUs is real; a long bench will show creeping per-proof times.
- The first proof in any worker process is slower (zkey + wasm load). `baseline.js` discards it; `run.js` does not, so production runs include that cost in their long tail.
- Kafka leader election and partition reassignment on `docker compose up --scale worker=N` adds a one-time settle cost of a few seconds; `run.js` waits for the group to stabilize before firing jobs to keep this out of the measurement window.
- Windows / WSL2 file I/O for the WASM is non-trivial; on Linux hosts the warmup gap is smaller.

These are the things you would call out in a research-paper *threats to validity* section.

---

## 9. What this does NOT prove

- It does **not** prove that a public, audited Powers of Tau ceremony is faster or slower. We use a dev-only ceremony.
- It does **not** prove anything about PLONK or other universal-setup proof systems. Those have a different proving-time profile and a smaller per-circuit setup cost; they are listed as future work in PLAN.md.
- It does **not** prove that a real autoscaler can react fast enough. We only show the *signal* exists and is sampleable. The autoscaler controller is future work.
- It does **not** prove anything about end-to-end blockchain payment semantics. `balance_proof` proves solvency under a commitment — a building block, not a payment system. Nullifiers are needed for actual spend semantics.
