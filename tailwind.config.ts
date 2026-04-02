import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf4f3",
          100: "#fce8e4",
          200: "#fad4ce",
          300: "#f5b5aa",
          400: "#ed8b79",
          500: "#e0644e",
          600: "#cc4a31",
          700: "#ab3b25",
          800: "#8d3422",
          900: "#763023",
          950: "#40150e",
        },
        sage: {
          50: "#f4f7f4",
          100: "#e3eae3",
          200: "#c7d5c8",
          300: "#a1b8a3",
          400: "#78977b",
          500: "#587b5b",
          600: "#446247",
          700: "#384f3a",
          800: "#2f4031",
          900: "#28352a",
          950: "#131d15",
        },
        sand: {
          50: "#faf8f2",
          100: "#f3efe1",
          200: "#e6ddc2",
          300: "#d5c69c",
          400: "#c3ab75",
          500: "#b6965a",
          600: "#a9834e",
          700: "#8c6942",
          800: "#72553b",
          900: "#5e4732",
          950: "#332419",
        },
      },
      fontFamily: {
        sans: ["var(--font-varela)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-varela)", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
