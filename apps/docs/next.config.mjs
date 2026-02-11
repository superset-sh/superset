import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import { createMDX } from "fumadocs-mdx/next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
		],
	},
	async redirects() {
		return [
			{
				source: "/",
				destination: "/installation",
				permanent: false,
			},
			{
				source: "/docs",
				destination: "/installation",
				permanent: false,
			},
		];
	},
	async rewrites() {
		return [
			// Fumadocs MDX rewrites
			{
				source: "/:path*.mdx",
				destination: "/llms.mdx/:path*",
			},
			// PostHog rewrites
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

export default withSentryConfig(withMDX(config), {
	org: "superset-sh",
	project: "docs",
	silent: !process.env.CI,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
});
