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
	// Compiles @lingui/react/macro at build time. Version must stay in
	// lockstep with Next's swc_core ABI — see plans/20260826-i18n-strategy.md.
	experimental: {
		swcPlugins: [["@lingui/swc-plugin", {}]],
	},
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
				source: "/docs",
				destination: "/",
				permanent: false,
			},
			// Legacy /docs-prefixed URLs (e.g. /docs/automations) now live at root.
			{
				source: "/docs/:path*",
				destination: "/:path*",
				permanent: true,
			},
			// Old top-level entry points from the previous docs structure (were 404ing).
			{
				source: "/getting-started",
				destination: "/overview",
				permanent: true,
			},
			{
				source: "/installation",
				destination: "/overview",
				permanent: true,
			},
			{
				source: "/quick-start",
				destination: "/first-workspace",
				permanent: true,
			},
			{
				source: "/terminal-presets",
				destination: "/terminal-scripts",
				permanent: true,
			},
			// Remote Workspaces was renamed to Remote Access.
			{
				source: "/remote-workspaces",
				destination: "/remote-access",
				permanent: true,
			},
		];
	},
	async headers() {
		// Keep raw markdown surfaces out of the index (they duplicate rendered pages).
		return [
			{
				source: "/:path*.mdx",
				headers: [{ key: "X-Robots-Tag", value: "noindex" }],
			},
			{
				source: "/llms-full.txt",
				headers: [{ key: "X-Robots-Tag", value: "noindex" }],
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
	applicationKey: "superset-docs",
	silent: !process.env.CI,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
});
