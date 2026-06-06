pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Private balance proof.
//
// Public inputs:  amount, commitment
// Private inputs: balance, salt
//
// Constraints:
//   1) Poseidon(balance, salt) === commitment
//   2) balance >= amount   (both range-checked to 64 bits)
//
// This proves solvency without revealing the balance or the salt that hides it.
template BalanceProof(N) {
    signal input balance;     // private
    signal input salt;        // private
    signal input amount;      // public
    signal input commitment;  // public

    // (1) Commitment binding: prover must know (balance, salt) that hash to commitment.
    component hasher = Poseidon(2);
    hasher.inputs[0] <== balance;
    hasher.inputs[1] <== salt;
    hasher.out === commitment;

    // (2) Range-check both inputs to N bits BEFORE the comparison —
    //     circomlib GreaterEqThan trusts that its inputs fit in N bits,
    //     so an unconstrained large balance could otherwise wrap around the field.
    component balanceBits = Num2Bits(N);
    balanceBits.in <== balance;

    component amountBits = Num2Bits(N);
    amountBits.in <== amount;

    // (3) Solvency: balance >= amount.
    component geq = GreaterEqThan(N);
    geq.in[0] <== balance;
    geq.in[1] <== amount;
    geq.out === 1;
}

// N = 64 bits — proving time scales with N. Documented in METHODOLOGY.md.
component main {public [amount, commitment]} = BalanceProof(64);
