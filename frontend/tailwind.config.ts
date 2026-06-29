import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        surface3: "var(--surface3)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        dim: "var(--text-dim)",
        gold: "var(--gold)",
        "gold-light": "var(--gold-light)",
        purple: "var(--purple)",
        teal: "var(--teal)",
        rose: "var(--rose)",
        green: "var(--green)",
        red: "var(--red)",
      },
      fontFamily: {
        sans: ["Public Sans", "sans-serif"],
        display: ["Cormorant Garamond", "serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
