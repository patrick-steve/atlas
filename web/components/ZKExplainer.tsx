"use client";

import { useState } from "react";
import clsx from "clsx";
import { Panel } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

type Step = 0 | 1 | 2 | 3;

const STEP_DEFS: { key: Step; tag: string; title: string; lede: string }[] = [
  {
    key: 0,
    tag: "STAGE I",
    title: "Commit",
    lede: "Alice holds a balance she doesn't want to reveal. She picks a random salt and publishes only the hash.",
  },
  {
    key: 1,
    tag: "STAGE II",
    title: "Prove",
    lede: "When she wants to demonstrate she can afford an amount, she runs the prover with both private inputs.",
  },
  {
    key: 2,
    tag: "STAGE III",
    title: "Verify",
    lede: "Anyone with the verification key can check the proof in microseconds, on a phone or on-chain.",
  },
  {
    key: 3,
    tag: "STAGE IV",
    title: "Repeat at scale",
    lede: "Each new amount needs a fresh proof. Proving is the bottleneck — so we distribute it.",
  },
];

export function ZKExplainer() {
  const [step, setStep] = useState<Step>(0);

  return (
    <section id="explainer" className="py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeader
          index="01"
          kicker="CIRCUIT :: BALANCE_PROOF.CIRCOM // GROTH16"
          title="What the circuit actually proves, without revealing anything else."
          lede="Atlas's circuit is a private balance proof. Alice proves she has at least the amount she claims to spend, against a previously-published Poseidon commitment to her balance — without revealing the balance or the salt that hides it. This section walks through what is private, what is public, and where proving time goes."
        />

        {/* Step rail */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {STEP_DEFS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={clsx(
                "text-left border px-3 py-3 transition-colors group",
                step >= s.key
                  ? "border-signal/40 bg-signal/5"
                  : "border-ink-600 bg-ink-900/40 hover:border-ink-600",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={clsx("label", step >= s.key ? "text-signal/80" : "")}>{s.tag}</span>
                <span
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full",
                    step === s.key ? "bg-signal animate-pulse-signal" : step > s.key ? "bg-signal/60" : "bg-mute-400",
                  )}
                />
              </div>
              <div
                className={clsx(
                  "font-mono text-sm uppercase tracking-wider",
                  step >= s.key ? "text-mute-50" : "text-mute-200",
                )}
              >
                {s.title}
              </div>
              <div className="text-xs text-mute-300 mt-1 leading-relaxed">{s.lede}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Left: visual representation of inputs/outputs by stage */}
          <div className="col-span-12 lg:col-span-7">
            <Panel channel={`CH 0${step + 1}`} title={`STAGE ${step + 1} :: DATA FLOW`} status="static">
              <StageVisual step={step} />
            </Panel>
          </div>

          {/* Right: actual circom source extract */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            <Panel channel="SRC" title="BALANCE_PROOF.CIRCOM // EXTRACT" status="static">
              <pre className="text-xs leading-relaxed font-mono text-mute-100 overflow-x-auto">
                <code>
                  <span className="text-mute-300">// 432 non-linear constraints</span>
                  {"\n"}
                  <span className="text-signal">template</span> BalanceProof(N) {"{"}{"\n"}
                  {"  "}<span className="text-mute-300">// private</span>{"\n"}
                  {"  "}<span className="text-amber">signal input</span> balance;{"\n"}
                  {"  "}<span className="text-amber">signal input</span> salt;{"\n"}
                  {"\n"}
                  {"  "}<span className="text-mute-300">// public</span>{"\n"}
                  {"  "}<span className="text-signal">signal input</span> amount;{"\n"}
                  {"  "}<span className="text-signal">signal input</span> commitment;{"\n"}
                  {"\n"}
                  {"  "}<span className="text-mute-300">// (1) binding</span>{"\n"}
                  {"  "}<span className="text-mute-50">Poseidon(2)</span>{"\n"}
                  {"  "}{"  "}.inputs <span className="text-signal">{"<=="}</span> [balance, salt];{"\n"}
                  {"  "}{"  "}.out <span className="text-signal">{"==="}</span> commitment;{"\n"}
                  {"\n"}
                  {"  "}<span className="text-mute-300">// (2) range-check</span>{"\n"}
                  {"  "}<span className="text-mute-50">Num2Bits(N)</span> balance, amount;{"\n"}
                  {"\n"}
                  {"  "}<span className="text-mute-300">// (3) solvency</span>{"\n"}
                  {"  "}<span className="text-mute-50">GreaterEqThan(N)</span>{"\n"}
                  {"  "}{"  "}.in <span className="text-signal">{"<=="}</span> [balance, amount];{"\n"}
                  {"  "}{"  "}.out <span className="text-signal">{"==="}</span> 1;{"\n"}
                  {"}"}{"\n"}
                </code>
              </pre>
            </Panel>
            <Panel channel="CONSTRAINTS" title="BUDGET // 432 R1CS" status="static">
              <ConstraintBudget />
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageVisual({ step }: { step: Step }) {
  // Concrete worked example. Numbers chosen for legibility.
  const balance = 12_500n;
  const salt = 4242n;
  const amount = 7_000n;
  const commitment = "0x14b…c3e1"; // a sample Poseidon digest abbreviation

  const isPrivateRevealed = step >= 1;
  const proofExists = step >= 2;
  const verified = step >= 2;
  const repeating = step === 3;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Inputs column */}
      <div className="col-span-12 sm:col-span-5 flex flex-col gap-3">
        <div className="label">INPUTS</div>
        <Field
          tone="amber"
          locked
          label="BALANCE // PRIVATE"
          value={isPrivateRevealed ? balance.toString() : "•••••"}
        />
        <Field
          tone="amber"
          locked
          label="SALT // PRIVATE"
          value={isPrivateRevealed ? salt.toString() : "•••••"}
        />
        <div className="rule my-1" />
        <Field label="AMOUNT // PUBLIC" value={amount.toString()} />
        <Field label="COMMITMENT // PUBLIC" value={commitment} mono />
      </div>

      {/* Circuit column */}
      <div className="col-span-12 sm:col-span-3 flex flex-col items-center justify-center">
        <div
          className={clsx(
            "h-32 w-full border flex flex-col items-center justify-center transition-all",
            step >= 1 ? "border-signal/60 bg-signal/10" : "border-ink-600 bg-ink-800/30",
          )}
        >
          <div className="label">CIRCUIT</div>
          <div className={clsx("font-mono text-2xl tracking-wider mt-2", step >= 1 ? "phosphor" : "text-mute-300")}>
            ∇<span className="text-base">·</span>π
          </div>
          <div className="label mt-2 text-center">
            432 R1CS<br />
            {step >= 1 ? "PROVING ↑" : "IDLE"}
          </div>
        </div>
      </div>

      {/* Outputs column */}
      <div className="col-span-12 sm:col-span-4 flex flex-col gap-3">
        <div className="label">OUTPUTS</div>
        <Field
          label="PROOF // 256 BYTES"
          value={proofExists ? "0x b8d2 71fe 5a09 …" : "—"}
          mono
          tone={proofExists ? "signal" : "mute"}
        />
        <Field
          label="VERIFIER VERDICT"
          value={verified ? "✓ ACCEPT" : "—"}
          tone={verified ? "signal" : "mute"}
        />
        <div className="rule my-1" />
        <Field
          label="QUEUE FOR NEXT PROOF"
          value={repeating ? "1 → N workers" : "—"}
          tone={repeating ? "amber" : "mute"}
          mono
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  tone = "mute",
  mono = false,
  locked = false,
}: {
  label: string;
  value: string;
  tone?: "mute" | "signal" | "amber";
  mono?: boolean;
  locked?: boolean;
}) {
  const toneClass = tone === "signal" ? "phosphor" : tone === "amber" ? "phosphor-amber" : "text-mute-50";
  return (
    <div className="border border-ink-600 bg-ink-900/50 px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          {locked && <span className="text-amber text-[10px]">⌧</span>}
          <span className="label truncate">{label}</span>
        </div>
        <span className={clsx("text-sm truncate", toneClass, mono && "font-mono tnum")}>{value}</span>
      </div>
    </div>
  );
}

function ConstraintBudget() {
  // breakdown sourced from circomlib + our circuit
  const bars = [
    { label: "Poseidon(2)", count: 213, tone: "bg-signal" },
    { label: "Num2Bits × 2", count: 130, tone: "bg-signal/60" },
    { label: "GreaterEqThan(64)", count: 65, tone: "bg-amber" },
    { label: "Wiring / glue", count: 24, tone: "bg-mute-200/50" },
  ];
  const total = bars.reduce((a, b) => a + b.count, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden border border-ink-600">
        {bars.map((b) => (
          <div
            key={b.label}
            className={clsx(b.tone, "h-full")}
            style={{ width: `${(b.count / total) * 100}%` }}
            title={`${b.label}: ${b.count}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
        {bars.map((b) => (
          <li key={b.label} className="flex items-center justify-between text-mute-100">
            <span className="flex items-center gap-2 truncate">
              <span className={clsx("h-2 w-2", b.tone)} />
              {b.label}
            </span>
            <span className="text-mute-50 tnum">{b.count}</span>
          </li>
        ))}
      </ul>
      <div className="rule" />
      <div className="text-xs text-mute-300 leading-relaxed">
        Proving time scales with the comparator bit-width <span className="text-mute-100">N</span>. We chose
        N = 64 to fit standard token amounts; doubling N nearly doubles the GreaterEqThan and Num2Bits cost.
        That knob is exposed by the producer as the <span className="font-mono text-mute-100">complexityClass</span> key
        and partitions the Kafka topic so heavy and light proofs don't starve each other.
      </div>
    </div>
  );
}
