pragma circom 2.1.6;

// Warm-up circuit: prove knowledge of two factors a, b such that a * b == c.
// Pure toolchain sanity check — no circomlib dependency.
template Multiplier() {
    signal input a;
    signal input b;
    signal output c;

    c <== a * b;
}

component main = Multiplier();
