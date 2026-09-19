import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#14110E",
          900: "#1C1814",
          700: "#3F3A34",
          500: "#6F675D",
          300: "#B7AFA4",
        },
        paper: {
          50: "#FBF7F0",
          100: "#F4EEE4",
          200: "#E8DFD0",
        },
        pine: {
          700: "#1F4A45",
          600: "#2B625B",
          500: "#3A7A71",
        },
        rust: {
          600: "#9A3B2F",
          500: "#C45C3E",
        },
        gold: {
          600: "#8A6A2F",
          500: "#C4A35A",
        },
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,17,14,0.04), 0 8px 24px rgba(20,17,14,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
