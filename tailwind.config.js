/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0d12",
        surface: "#14171f",
        surface2: "#1c2029",
        accent: "#22d3ee",
        urgentHigh: "#ef4444",
        urgentMed: "#f59e0b",
        urgentLow: "#10b981",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
