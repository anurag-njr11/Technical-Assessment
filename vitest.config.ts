import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          include: ["__tests__/convex/**/*.test.{ts,tsx}"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        extends: true,
        test: {
          name: "frontend",
          include: ["__tests__/**/*.test.{ts,tsx}"],
          exclude: ["__tests__/convex/**", "node_modules", ".tanstack", ".macaly", ".sandbox"],
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: [
      { find: /^@\/convex\//, replacement: path.resolve(__dirname, "./convex") + "/" },
      { find: /^@\//, replacement: path.resolve(__dirname, "./src") + "/" },
    ],
  },
})
