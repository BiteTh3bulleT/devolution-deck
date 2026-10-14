/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "var(--deck-bg)",
          surface: "var(--deck-surface)",
          panel: "var(--deck-panel)",
          border: "var(--deck-border)",
          muted: "var(--deck-muted)",
          graphite: "var(--deck-graphite)",
          text: "var(--deck-text)",
          "text-muted": "var(--deck-text-muted)",
          accent: "var(--deck-accent)",
          "accent-dim": "var(--deck-accent-dim)",
          cyan: "var(--deck-cyan)",
          magenta: "var(--deck-magenta)",
          amber: "var(--deck-amber)",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "IBM Plex Sans", "sans-serif"],
        display: ["Orbitron", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 16px rgba(228, 167, 95, 0.12)",
        "glow-cyan": "0 0 12px rgba(124, 203, 208, 0.12)",
      },
    },
  },
  plugins: [],
};
