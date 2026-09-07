import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
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
// The leaderboard/fight/stats pages call the API from the browser
// (leaderboardClient). Hard-coded prod fallback so the header stays correct
// even if NEXT_PUBLIC_API_URL isn't in the build env.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL
	? new URL(process.env.NEXT_PUBLIC_API_URL).origin
	: isProduction
		? "https://api.superset.sh"
		: null;

// Third parties this site actually loads (probed against production):
// - Google Ads gtag + Reddit pixel, injected in [lang]/layout.tsx
// - Cloudflare Web Analytics, injected at the edge by the Cloudflare proxy
// - Work at a Startup job board (+ its hCaptcha) on /join-us
// - PostHog goes through the same-origin /ingest rewrite; ui_host is listed
//   so the toolbar can still connect.
// - Sentry browser SDK reports to *.ingest.sentry.io
const googleAdsScripts = [
	"https://www.googletagmanager.com",
	"https://www.googleadservices.com",
	"https://googleads.g.doubleclick.net",
	"https://www.google.com",
];
const hcaptcha = ["https://hcaptcha.com", "https://*.hcaptcha.com"];

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		apiOrigin,
		"https://*.ingest.sentry.io",
		"https://*.sentry.io",
		"https://us.posthog.com",
		"https://cloudflareinsights.com",
		"https://www.google.com",
		"https://www.googleadservices.com",
		"https://googleads.g.doubleclick.net",
		"https://ad.doubleclick.net",
		"https://alb.reddit.com",
		"https://www.workatastartup.com",
		...hcaptcha,
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	"font-src 'self' data: https://fonts.gstatic.com https://www.workatastartup.com",
	"form-action 'self'",
	"frame-ancestors 'none'",
	[
		"frame-src",
		"https://td.doubleclick.net",
		"https://www.googletagmanager.com",
		...hcaptcha,
	].join(" "),
	"img-src 'self' data: blob: https:",
	"object-src 'none'",
	[
		"script-src 'self' 'unsafe-inline'",
		...googleAdsScripts,
		"https://www.redditstatic.com",
		"https://static.cloudflareinsights.com",
		"https://www.workatastartup.com",
		...hcaptcha,
		!isProduction && "'unsafe-eval'",
	]
		.filter(Boolean)
		.join(" "),
	[
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		...hcaptcha,
	].join(" "),
	"worker-src 'self' blob:",
].join("; ");

const config: NextConfig = {
	reactStrictMode: true,
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	// Compiles @lingui/react/macro at build time. Version must stay in
	// lockstep with Next's swc_core ABI — see plans/20260826-i18n-strategy.md.
	experimental: {
		// next/root-params powers the [lang] locale resolution in i18n-server.ts.
		rootParams: true,
		swcPlugins: [["@lingui/swc-plugin", {}]],
	},

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "unavatar.io",
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

	async redirects() {
		const docsUrl =
			process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.superset.sh";
		return [
			// These URLs were advertised before discovery files were excluded
			// from locale expansion. Keep existing inbound links working.
			{
				source: `/:lang(${SUPPORTED_LOCALES.join("|")})/llms.txt`,
				destination: "/llms.txt",
				permanent: true,
			},
			{
				source: "/opengraph-image",
				destination: "/og-image.png",
				permanent: true,
			},
			{
				source: "/about",
				destination: "/team",
				permanent: true,
			},
			{
				source: "/mcp",
				destination: "https://api.superset.sh/mcp",
				permanent: false,
			},
			{
				source: "/changelog/2026-03-09-codemirror-workspace-modal-icons",
				destination: "/changelog/2026-03-09-codemirror-workspace",
				permanent: true,
			},
			{
				source: "/docs/:path*",
				destination: `${docsUrl}/:path*`,
				permanent: false,
			},
		];
	},

	async headers() {
		return [
			{
				source: "/",
				headers: [
					{
						key: "Link",
						value: [
							'</sitemap.xml>; rel="sitemap"',
							'</index.md>; rel="alternate"; type="text/markdown"',
							'</llms.txt>; rel="describedby"; type="text/plain"',
							'</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
							'<https://api.superset.sh/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
						].join(", "),
					},
				],
			},
			{
				source: "/(.*)",
				headers: [
					{ key: "Content-Security-Policy", value: contentSecurityPolicy },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
				],
			},
		];
	},

	skipTrailingSlashRedirect: true,
};

export default withSentryConfig(config, {
	org: "superset-sh",
	project: "marketing",
	applicationKey: "superset-marketing",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
