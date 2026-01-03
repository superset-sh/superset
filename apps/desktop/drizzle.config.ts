import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/renderer/lib/pglite/schema/schema.ts",
	out: "./src/renderer/lib/pglite/migrations",
	dialect: "postgresql",
});
