import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const isProduction = process.env.NODE_ENV === "production";
const apiOrigin = process.env.NEXT_PUBLIC_API_URL
	? new URL(process.env.NEXT_PUBLIC_API_URL).origin
	: null;

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		apiOrigin,
		"https://*.ingest.sentry.io",
		"https://*.sentry.io",
		"https://us.i.posthog.com",
		"https://us-assets.i.posthog.com",
		"https://us.posthog.com",
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	"font-src 'self' data: https://fonts.gstatic.com",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"img-src 'self' data: blob: https:",
	"object-src 'none'",
	["script-src 'self' 'unsafe-inline'", !isProduction && "'unsafe-eval'"]
		.filter(Boolean)
		.join(" "),
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"worker-src 'self' blob:",
].join("; ");

const securityHeaders: Array<{ key: string; value: string }> = [
	...(isProduction
		? [
				{
					key: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]
		: []),
	{
		key: "Content-Security-Policy",
		value: contentSecurityPolicy,
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=()",
	},
	{
		key: "Referrer-Policy",
		value: "strict-origin-when-cross-origin",
	},
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "X-Frame-Options",
		value: "DENY",
	},
];

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
		],
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

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
		];
	},

	skipTrailingSlashRedirect: true,
};

export default withSentryConfig(config, {
	org: "superset-sh",
	project: "web",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
