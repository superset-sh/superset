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
	rewrites: async () => [
		{
			source: "/ingest/static/:path*",
			destination: "https://us-assets.i.posthog.com/static/:path*",
		},
		{
			source: "/ingest/:path*",
			destination: "https://us.i.posthog.com/:path*",
		},
	],
};

export default config;
