/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#07090f",
          surface: "#101522",
          panel: "#131a2a",
          border: "#1f2a40",
          muted: "#2a2a34",
          graphite: "#3a3a46",
          text: "#e8edf8",
          "text-muted": "#95a3bf",
          accent: "#ff6b1a",
          "accent-dim": "#c75112",
          cyan: "#38d7ff",
          magenta: "#ff4fd8",
          amber: "#ffc247",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "IBM Plex Sans", "sans-serif"],
        display: ["Orbitron", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(255, 107, 26, 0.2)",
        "glow-cyan": "0 0 12px rgba(34, 211, 238, 0.2)",
      },
    },
  },
  plugins: [],
};
