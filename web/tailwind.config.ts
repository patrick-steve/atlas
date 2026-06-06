import type { Config } from "tailwindcss";

// Instrument-panel palette. Near-black background, signal-green phosphor accent,
// amber for secondary warnings, slate grays for type. Tabular numerals enabled
// globally so latency counters don't wobble as digits change.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Background layers — from page bg outward
        ink: {
          950: "#05070A",   // page bg
          900: "#0A0D12",   // panel bg
          800: "#10141B",   // raised panel
          700: "#1A1F29",   // hover / focus
          600: "#252B37",   // divider
        },
        // Phosphor — primary signal accent
        signal: {
          DEFAULT: "#7EE787",   // signal green
          dim: "#3FA948",
          bright: "#B6F2BC",
          glow: "rgba(126,231,135,0.18)",
        },
        // Amber — secondary, for warnings & "high complexity" branch
        amber: {
          DEFAULT: "#F2C055",
          dim: "#A77C24",
          bright: "#FFE399",
        },
        // Type
        mute: {
          50: "#D8DDE5",
          100: "#B6BFCC",
          200: "#8893A4",
          300: "#5E6675",
          400: "#3F4654",
        },
        // Status
        danger: "#FF6E6E",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tight: "-0.01em",
        wider: "0.08em",
        widest: "0.18em",
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 1px 0 0 rgba(255,255,255,0.02) inset",
        glow: "0 0 0 1px rgba(126,231,135,0.35), 0 0 24px -8px rgba(126,231,135,0.6)",
      },
      backgroundImage: {
        "grid-fine":
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        scanline:
          "linear-gradient(to bottom, transparent 0px, rgba(126,231,135,0.05) 1px, transparent 2px)",
      },
      backgroundSize: {
        "grid-32": "32px 32px",
        "grid-16": "16px 16px",
      },
      animation: {
        "pulse-signal": "pulseSignal 2s ease-in-out infinite",
        "scan-down": "scanDown 8s linear infinite",
        "tick": "tick 1s steps(1) infinite",
      },
      keyframes: {
        pulseSignal: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        scanDown: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        tick: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
