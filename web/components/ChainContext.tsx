import { Panel } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

export function ChainContext() {
  return (
    <section id="chain" className="py-20 sm:py-28 border-t border-ink-600/40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeader
          index="05"
          kicker="CHAIN :: COMMITMENTS / VERIFIER / ROLLUPS"
          title="Where this fits in the actual on-chain stack."
          lede="The circuit is a real Groth16 verifier candidate. snarkjs exports a Solidity verifier for it; we don't deploy it, but the file lives in the repo and the gas envelope is small enough to be practical. This section frames what the demo proves, what it doesn't, and how the same pattern shows up at industrial scale in zk-rollups."
        />

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            <Panel channel="CH 01" title="WHAT THE CIRCUIT PROVES // PRECISELY" status="static">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-6 flex flex-col gap-2">
                  <div className="label">CLAIM</div>
                  <code className="block font-mono text-sm text-mute-50 leading-relaxed">
                    ∃ (balance, salt). <br />
                    {"  "}Poseidon(balance, salt) = C ∧<br />
                    {"  "}balance ≥ amount
                  </code>
                </div>
                <div className="col-span-12 sm:col-span-6 flex flex-col gap-2">
                  <div className="label">PUBLIC INPUTS</div>
                  <ul className="font-mono text-sm text-mute-100 space-y-1">
                    <li><span className="text-signal">amount</span> — the floor the prover claims</li>
                    <li><span className="text-signal">commitment</span> — published once, never re-derivable</li>
                  </ul>
                </div>
                <div className="col-span-12 mt-2">
                  <div className="label mb-2">WHAT IT DOES <span className="text-mute-400">NOT</span> PROVE</div>
                  <ul className="text-sm text-mute-100 leading-relaxed space-y-1 list-['—']">
                    <li className="pl-2">
                      That a previous spend did not already exhaust the balance — there is{" "}
                      <span className="phosphor">no nullifier</span> in this circuit. Adding one is the difference
                      between a solvency proof and a real payment system.
                    </li>
                    <li className="pl-2">
                      That the commitment corresponds to anything on a particular blockchain. That binding is the job
                      of a separate Merkle-membership proof against a state root.
                    </li>
                    <li className="pl-2">
                      That the prover and the commitment owner are the same entity. A signature over the proof's public
                      inputs would close that gap.
                    </li>
                  </ul>
                </div>
              </div>
            </Panel>

            <Panel channel="CH 02" title="VERIFIER.SOL // ON-CHAIN ENVELOPE" status="static">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-7 flex flex-col gap-3">
                  <p className="text-sm text-mute-100 leading-relaxed">
                    <span className="font-mono text-mute-50">snarkjs zkey export solidityverifier</span> emits a Solidity
                    contract that checks any proof for this circuit. The proof itself is 256 bytes; verification is a fixed
                    sequence of BN254 pairings.
                  </p>
                  <ul className="font-mono text-xs text-mute-100 space-y-1">
                    <li><span className="label">PROOF SIZE</span> <span className="tnum text-mute-50">256 bytes</span></li>
                    <li><span className="label">VERIFY GAS</span> <span className="tnum text-mute-50">≈ 250,000</span> (Groth16 pairing precompile)</li>
                    <li><span className="label">PUBLIC INPUTS</span> <span className="tnum text-mute-50">2 × 32 bytes</span> on calldata</li>
                    <li><span className="label">SCHEME</span> Groth16 on BN254 (matches Ethereum precompiles)</li>
                  </ul>
                  <p className="text-xs text-mute-300 leading-relaxed">
                    Numbers are typical for a Groth16 verifier of this shape; exact gas depends on the EVM implementation
                    and any preliminary calldata decoding. Atlas does <em>not</em> deploy this contract — it ships in the
                    repo for reproducibility.
                  </p>
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <pre className="text-[11px] font-mono leading-snug text-mute-100 bg-ink-950/60 border border-ink-600 p-3 overflow-auto">
                    <code>{`pragma solidity ^0.8.x;
contract Verifier {
  function verifyProof(
    uint[2] _pA,
    uint[2][2] _pB,
    uint[2] _pC,
    uint[2] _pubSignals
  ) public view returns (bool);
}`}</code>
                  </pre>
                </div>
              </div>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            <Panel channel="CH 03" title="WHY THIS IS THE ROLLUP PATTERN" status="static">
              <p className="text-sm text-mute-100 leading-relaxed">
                Atlas is intentionally the smallest interesting version of what a zk-rollup prover does:
                take a stream of arbitrary user state transitions, produce a single proof per batch, and let the L1
                chain verify cheaply.
              </p>
              <ul className="text-sm text-mute-100 leading-relaxed mt-3 space-y-2 list-['→']">
                <li className="pl-2"><span className="phosphor">Proving is the cost center.</span> A real rollup
                  prover is a fleet of beefy machines doing exactly this work, often with proof aggregation on top.</li>
                <li className="pl-2"><span className="phosphor">Verifying is constant-time.</span> The L1 doesn't
                  care how many user transactions a proof represents — it pays the same fixed gas to accept it.</li>
                <li className="pl-2"><span className="phosphor-amber">Coordination is the systems problem.</span>
                  {" "}Which prover gets which batch, how to handle a slow prover, how to autoscale on lag — those
                  are the same questions Atlas asks in miniature.</li>
              </ul>
            </Panel>

            <Panel channel="CH 04" title="HONEST FRAMING" status="warn">
              <p className="text-sm text-mute-100 leading-relaxed">
                This is a building block, not a payment system. It demonstrates a deployable Groth16 verifier, a measurable
                proving bottleneck, and a horizontally scalable proving pool. Turning it into something real means:
              </p>
              <ul className="text-xs text-mute-100 leading-relaxed mt-3 space-y-1">
                <li>· nullifiers for spend semantics</li>
                <li>· Merkle membership against an on-chain state root</li>
                <li>· a fee market that prices proving time</li>
                <li>· a public Powers of Tau ceremony in place of the dev-only one</li>
                <li>· an autoscaler controller acting on the lag signal we expose</li>
              </ul>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                These are not papered over — they are the explicit{" "}
                <a className="text-signal underline-offset-2 hover:underline" href="#methodology">future work</a> in the
                methodology doc.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}
