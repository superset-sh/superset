import { SUPPORTED_LOCALES } from "@superset/i18n/locales";

const ROUTES = [
	"agent-orchestration",
	"blog",
	"changelog",
	"community",
	"compare",
	"contact",
	"download",
	"enterprise",
	"factory-2026",
	"fight",
	"join-us",
	"leaderboard",
	"marketplace",
	"mcp-install",
	"md",
	"parallel-coding-agents",
	"people",
	"pricing",
	"roadmap",
	"starchart",
	"stats",
	"team",
	"the-production-run",
	"user",
	"users",
] as const;

const LEGAL = [
	"legal",
	"privacy",
	"security",
	"subprocessors",
	"terms",
] as const;

const WELL_KNOWN = [
	"agents.md",
	"api",
	"auth.md",
	"changelog.xml",
	"favicon.ico",
	"feed.xml",
	"index.md",
	"llms-full.txt",
	"llms.md",
	"llms.txt",
	"manifest.json",
	"opengraph-image",
	"robots.txt",
	"schemamap.xml",
	"schemas",
	"sitemap.xml",
	"well-known",
] as const;

const FUTURE = [
	"about",
	"account",
	"admin",
	"billing",
	"careers",
	"cli",
	"dashboard",
	"desktop",
	"docs",
	"events",
	"explore",
	"help",
	"home",
	"integrations",
	"invite",
	"jobs",
	"login",
	"logout",
	"new",
	"onboarding",
	"orgs",
	"partners",
	"press",
	"pricing-faq",
	"privacy-policy",
	"profile",
	"search",
	"settings",
	"signin",
	"signup",
	"sitemap",
	"status",
	"support",
	"trust",
] as const;

const BRANDS = [
	"anthropic",
	"apple",
	"aws",
	"azure",
	"claude",
	"cursor",
	"github",
	"gitlab",
	"google",
	"linear",
	"meta",
	"microsoft",
	"netlify",
	"notion",
	"openai",
	"slack",
	"stripe",
	"superset",
	"vercel",
] as const;

export const RESERVED_HANDLES: ReadonlySet<string> = new Set<string>([
	...ROUTES,
	...LEGAL,
	...WELL_KNOWN,
	...FUTURE,
	...BRANDS,
	...SUPPORTED_LOCALES.map((locale) => locale.toLowerCase()),
]);

export function isReservedHandle(handle: string): boolean {
	return RESERVED_HANDLES.has(handle.trim().toLowerCase());
}

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

export function isProfileHandle(segment: string): boolean {
	const candidate = segment.toLowerCase();
	return HANDLE_PATTERN.test(candidate) && !RESERVED_HANDLES.has(candidate);
}
