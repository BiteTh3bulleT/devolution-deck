/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#0a0a0c",
          surface: "#121216",
          panel: "#16161c",
          border: "#1e1e26",
          muted: "#2a2a34",
          graphite: "#3a3a46",
          text: "#e4e4ea",
          "text-muted": "#9090a0",
          accent: "#7c3aed",
          "accent-dim": "#5b21b6",
          cyan: "#22d3ee",
          magenta: "#e879f9",
          amber: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["Orbitron", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(124, 58, 237, 0.15)",
        "glow-cyan": "0 0 12px rgba(34, 211, 238, 0.2)",
      },
    },
  },
  plugins: [],
};
