# Atlas proof worker.
# Bundles the compiled circuit artefacts so the container is self-contained.

FROM node:20-bookworm-slim

WORKDIR /app

# Worker package and deps.
COPY worker/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Worker source.
COPY worker/index.js ./index.js
COPY worker/prover.worker.js ./prover.worker.js

# Compiled circuit artefacts (zkey + wasm + vkey) needed at runtime.
# These are produced on the host by `npm run setup:balance` in /pipeline/circuits.
COPY circuits/build/balance_proof.zkey ./build/balance_proof.zkey
COPY circuits/build/balance_proof.vkey.json ./build/balance_proof.vkey.json
COPY circuits/build/balance_proof_js/balance_proof.wasm ./build/balance_proof.wasm

ENV BUILD_DIR=/app/build

CMD ["node", "index.js"]
