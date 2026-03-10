import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json", "../../packages/ui/tsconfig.json"],
    }),
    tailwindcss(),
    react(),
  ],
  envDir: "../../",
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "~/components/ui": path.resolve(__dirname, "../../packages/ui/src/_shadcn"),
      "~": path.resolve(__dirname, "../../packages/ui/src"),
      "zod/v4/core": "zod",
    },
  },
});
