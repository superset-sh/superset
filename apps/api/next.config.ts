import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({ path: join(process.cwd(), "../../.env"), override: true });
}

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	// CORS is handled dynamically in the route handlers
};

export default config;
