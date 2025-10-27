import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this config file
const configDir = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the root .env file
config({ path: path.resolve(configDir, "../../.env") });

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default defineConfig({
	schema: "./src/schema",
	out: "./migrations",
	dialect: "postgresql",
	schemaFilter: ["public"],
	verbose: true,
	dbCredentials: {
		url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
	},
});
