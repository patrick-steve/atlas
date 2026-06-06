# ATLAS — Distributed ZK Proof Generation

> Proving is the bottleneck. Verifying is cheap. So we distribute proving.

Atlas is a research pipeline that takes the CPU-bound single-threaded cost of generating Groth16 zero-knowledge proofs — for a real private-balance circuit — and turns it into a horizontally scalable system coordinated by Kafka. A showcase site explains the work, presents the benchmarks, and offers a live demo.

The repository ships in two parts that intentionally live in different worlds:

| Component | Lives | Why |
|---|---|---|
| `pipeline/` | the developer's machine, via Docker Compose | needs Kafka + long-lived CPU workers, not viable on serverless |
| `web/` | Vercel, fully self-contained | the deployed face of the project; uses committed `benchmarks.json` for charts and a simulated demo, with optional live mode when a tunneled gateway URL is configured |

---

## TL;DR — what we measured

On an Intel Core i5-11260H (12 logical cores):

| Workers | Throughput | Speedup vs ideal linear | p99 end-to-end |
|---:|---:|---:|---:|
| 1 | 5.4 p/s | 1.00× / 1× | 36 s |
| 2 | 10.7 p/s | 1.96× / 2× | 18 s |
| 4 | 20.5 p/s | 3.76× / 4× | 9 s |
| 8 | 37.4 p/s | 6.88× / 8× | 5 s |

The single-worker per-proof latency (~182 ms) was measured directly via `pipeline/benchmark/baseline.js`. Multi-worker numbers in the committed `benchmarks.json` are projected via the documented model in `pipeline/benchmark/METHODOLOGY.md`. Running the full Docker sweep (`pipeline/benchmark/run.js`) replaces every projected value with a measured one.

---

## Architecture

```
                 ┌──────────────┐
                 │  Web (Vercel)│ ───→ benchmarks.json (committed)
                 └──────┬───────┘
                        │ NEXT_PUBLIC_GATEWAY_URL (optional, live mode)
                        ▼
           ┌────────── gateway ──────────┐
           │  POST /jobs   WS /stream    │ ── Express + ws ── self-verify
           └─────────────────────────────┘
                        │
                  ┌─────┴─────┐
   producer ──→  │   KAFKA   │ ──→ workers ──→ proof-results
                  │  proof-jobs (8 parts)
                  │  proof-results (4 parts)
                  └───────────┘
                        │
                  observer (lag = log_end − committed)
```

Three rules govern every design choice in `pipeline/`:

1. **Proving lives in a `worker_thread`.** `snarkjs.groth16.fullProve` pegs a core for hundreds of ms; running it on the kafkajs consumer thread would miss heartbeats and trigger a rebalance mid-proof.
2. **Partition key = `complexityClass`** (`low` / `high`). Heavy and light traffic land on disjoint partitions, so a flood of "high" jobs cannot starve "low" ones — the Kafka analogue of separating SLO tiers.
3. **The gateway taps results on its own consumer group**, not the worker group. Sharing groups would steal job offsets from workers.

The lag observer is the *autoscaler signal* — `lag ÷ drain_rate = seconds-to-clear`, the input to an HPA-style controller. The controller itself is explicit future work (see `pipeline/benchmark/METHODOLOGY.md`, "future work").

---

## Run it locally

### Prerequisites
- **Node.js 20+**, **npm**
- **Rust + cargo** (to build circom — `cargo install --git https://github.com/iden3/circom.git --tag v2.1.9 --locked`)
- **Docker Desktop** for the Kafka pipeline (not required just to build the web app)

### Phase 1 — compile the circuit and prove once
```bash
cd pipeline/circuits
npm install
npm run compile:balance
npm run setup:balance
node prove.js                 # valid proof + verify
node prove.js --invalid       # invalid witness: refused by the constraint system
```

### Phase 2/3 — bring up Kafka + workers + gateway
```bash
cd pipeline
docker compose up -d --build --scale worker=4

# (in another shell)
cd producer && npm install && node index.js --count 100 --complexity low
cd ../observer && npm install && node index.js          # lag time series
cd ../gateway && npm install && node index.js           # http+ws on :8080
```

### Phase 4 — run the benchmark sweep
```bash
cd pipeline/benchmark
node run.js --workers 1,2,4,8 --jobs 200
node aggregate.js --sweep runs/sweep.jsonl --out ../../web/public/data/benchmarks.json
```

### Phase 5 — develop / deploy the showcase
```bash
cd web
npm install
npm run dev            # http://localhost:3000

# deploy
vercel deploy
# (optional) point the deployed site at your local gateway:
#   set NEXT_PUBLIC_GATEWAY_URL=https://your-tunnel-url
```

The site **builds and deploys with zero env vars set** — it uses the committed `benchmarks.json` for charts and a simulated demo. Setting `NEXT_PUBLIC_GATEWAY_URL` to a tunneled local gateway flips the demo into live mode automatically.

---

## What's in here

```
pipeline/
  circuits/                circom + snarkjs source, prove/verify helpers
    balance_proof.circom   the real circuit (432 R1CS constraints)
    multiplier.circom      warm-up
    prove.js               single-proof CLI
    scripts/setup.js       Powers of Tau + Groth16 setup pipeline
    build/                 compiled artefacts (gitignored, except for vkey)
      Verifier.sol         exported Solidity verifier (Groth16 / BN254)
  producer/                Kafka producer CLI; fires N jobs by complexity class
  worker/                  Kafka consumer + worker_thread prover
  observer/                consumer-group lag time series
  gateway/                 Express + WS bridge to the web
  benchmark/
    baseline.js            measured per-proof distribution (no Docker)
    run.js                 full Docker Compose sweep across worker counts
    synthesize.js          turns the baseline into a projected benchmarks.json
    aggregate.js           turns a measured sweep into benchmarks.json
    METHODOLOGY.md         the credibility doc
  docker-compose.yml       Kafka (KRaft, no Zookeeper) + N workers

web/                       Next.js 14 (App Router) showcase site
  app/                     layout, page, globals (instrument-panel theme)
  components/              7 sections — hero, circuit, architecture, demo,
                           benchmarks, chain context, methodology
  lib/demoSource.ts        live (gateway) vs simulated demo abstraction
  public/data/benchmarks.json    committed numbers consumed by the site
```

---

## Honest framing

This is a **building block**, not a payment system. The circuit proves solvency under a Poseidon commitment; it does not include nullifiers (so no spend semantics), Merkle membership (so no binding to a particular blockchain), or an owner signature. Each of those is a well-understood next step, explicitly listed in `pipeline/benchmark/METHODOLOGY.md §9` and in the site's "Future work" panel.

The Powers of Tau ceremony in `pipeline/circuits/scripts/setup.js` is a **local dev ceremony**, not a public audited one. Real deployments would substitute the Hermez or Aztec PoT output here without changing any other code.

---

## Tech versions (pinned to avoid the version-mismatch trap)

- circom 2.1.9 (Rust, `cargo install`)
- snarkjs 0.7.4
- circomlib 2.0.5 (circuit sources)
- circomlibjs 0.1.7 (JS Poseidon)
- kafkajs 2.2.4
- Bitnami Kafka 3.7 (KRaft mode)
- Next.js 14.2 (App Router) + TypeScript 5.6 + Tailwind 3.4 + Recharts 2.13
