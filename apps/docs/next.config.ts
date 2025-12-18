import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";
import nextra from "nextra";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({ path: join(process.cwd(), "../../.env"), override: true });
}

const withNextra = nextra({
	defaultShowCopyCode: true,
});

const nextConfig: NextConfig = {
	reactStrictMode: true,

	/** Turbopack MDX resolution for nextra */
	turbopack: {
		resolveAlias: {
			"next-mdx-import-source-file": "./mdx-components.tsx",
		},
	},

	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
			{
				source: "/ingest/decide",
				destination: "https://us.i.posthog.com/decide",
			},
		];
	},

	skipTrailingSlashRedirect: true,
};

export default withNextra(nextConfig);
