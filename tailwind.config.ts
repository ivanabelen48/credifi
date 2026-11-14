import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09090B",
        muted: "#71717A",
        canvas: "#F4F4F5",
        teal: "#22C55E",
      },
      boxShadow: {
        card: "0 8px 30px rgba(27, 47, 64, 0.045)",
      },
    },
  },
  plugins: [],
};

export default config;
