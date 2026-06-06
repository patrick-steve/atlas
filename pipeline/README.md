# pipeline/ — Local ZK proving cluster

Docker Compose stack that runs Kafka (KRaft mode, no Zookeeper) and a parameterizable pool of proof workers. Producer + observer + gateway are CLIs you run on the host — they connect to the broker on `localhost:9092`.

## One-time circuit setup

This step compiles the circuit and produces the proving/verification keys that the workers need.

```bash
cd circuits
npm install
npm run compile:balance        # circom → R1CS + WASM
npm run setup:balance          # Powers of Tau + Groth16 phase 2
node prove.js                  # sanity-check a single proof
```

Output: `circuits/build/balance_proof.zkey`, `balance_proof.vkey.json`, `balance_proof_js/balance_proof.wasm`, and the exported `Verifier.sol`. The worker Dockerfile copies these in at build time.

## Run the cluster

```bash
docker compose up -d --build --scale worker=4
```

That starts:
- one `kafka` broker (KRaft)
- a one-shot `topics-init` job that creates `proof-jobs` (8 partitions, key=complexityClass) and `proof-results` (4 partitions, key=jobId)
- four `worker` replicas in the `proof-workers` consumer group

Scale up or down with `docker compose up --scale worker=N`. The observer's lag plot will show the drain rate change.

## Producer / observer / gateway (host processes)

These are CLIs that talk to `localhost:9092`:

```bash
cd producer && npm install && node index.js --count 100 --complexity low
# or
node index.js --count 50 --complexity mixed       # 50/50 low/high

cd ../observer && npm install && node index.js
# tails lag every 2 s and writes observer-log.jsonl

cd ../gateway && npm install && node index.js
# http://localhost:8080
#   POST /jobs        enqueue a proof job
#   GET  /jobs/:id    poll a single result
#   GET  /health      {ok, activeWorkers, lag, uptimeSec}
#   GET  /metrics     {proofsTotal, errorsTotal, p50/p90/p99}
#   GET  /benchmarks  serves benchmarks.json (for the deployed site)
#   WS   /stream      every result, real-time
```

## Benchmark

```bash
cd benchmark
node baseline.js --count 50         # local per-proof distribution, no Kafka
node run.js --workers 1,2,4,8 --jobs 200   # full sweep (requires Docker)
node aggregate.js --sweep runs/sweep.jsonl --out ../../web/public/data/benchmarks.json
# OR — produce a projected benchmarks.json from the baseline (no Docker needed):
node synthesize.js
```

See `benchmark/METHODOLOGY.md` for what's measured, what's modelled, and how to read every chart on the showcase site.

## Tearing down

```bash
docker compose down
# remove volumes if you want a fully clean broker:
docker compose down -v
```

## Layout

```
pipeline/
  circuits/          balance_proof.circom + multiplier.circom + setup + prove
  producer/          kafka producer CLI
  worker/            consumer + worker_thread prover (Dockerfile in here)
  observer/          consumer-group lag sampler
  gateway/           http + ws bridge to the web frontend
  benchmark/         baseline, run, aggregate, synthesize, METHODOLOGY.md
  docker-compose.yml
```

## Common traps

- **Don't run the prover on the main thread.** snarkjs.groth16.fullProve pegs a CPU core for hundreds of ms; if it shares the kafkajs consumer thread, heartbeats stall, the broker ejects the worker mid-proof, and the result silently lands on a partition no one consumes. Atlas runs proving in a `worker_thread`. Period.
- **Don't share the worker consumer group with the gateway.** Gateway is a *tap* on the results topic; it joins its own short-lived group so it never claims a job partition.
- **circom version matters.** circom 2.1.x compiler (Rust install) + snarkjs 0.7.x + circomlib 2.0.x. Tutorials from before 2022 use incompatible APIs.
- **Powers of Tau 2¹⁵ is overkill** for the 432-constraint balance circuit but cheap, and saves you from re-running setup if you raise the comparator bit-width.

## Future work

Listed in the project root `README.md` and in `benchmark/METHODOLOGY.md §9`. Headline items: a real autoscaler controller on top of the lag signal, PLONK/Halo2 baselines, nullifiers + Merkle membership for spend semantics, k8s HPA instead of Compose scaling, real on-chain Verifier.sol deploy.
