import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Source Han Sans CN"',
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        bg: {
          0: "#0a0a0c",
          1: "#131316",
          2: "#1c1c20",
          3: "#26262c",
        },
        fg: "#e8e8ea",
        muted: "#7a7a82",
        accent: "#f5b942",
        right: "#f5b942",
        left: "#4dd0e1",
      },
    },
  },
  plugins: [],
} satisfies Config;