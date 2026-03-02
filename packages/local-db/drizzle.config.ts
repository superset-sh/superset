import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/schema/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
});
