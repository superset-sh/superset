import { type NextRequest, NextResponse } from "next/server";
import { markdownNotFoundBody } from "@/lib/markdown-not-found";

const MD_TWIN_PATTERN = /^\/(blog|compare|changelog)\/([^/]+)\.md$/;
const CONTENT_PAGE_PATTERN = /^\/(blog|compare|changelog)\/[^/.]+$/;

// Top-level category guide pages (content/category/*.mdx). Proxy runs on the
// edge without fs access, so the slugs are duplicated here; keep in sync.
const CATEGORY_SLUGS = ["parallel-coding-agents", "agent-orchestration"];

// Static pages with a hand-built markdown twin in app/md/[...path]/route.ts.
const PAGE_SLUGS = ["pricing", "mcp-install", "team", "enterprise"];

// Markdown documents served by their own route handlers; never 404 these here.
const MARKDOWN_ROUTES = new Set([
	"/index.md",
	"/agents.md",
	"/auth.md",
	"/llms.md",
]);

// AI assistants and AI search crawlers that prefer markdown. Search-engine
// indexers (Googlebot, Bingbot) are deliberately absent: they get the HTML.
const MARKDOWN_BOT_UA =
	/GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|DeepSeekBot|DuckAssistBot|Meta-ExternalAgent|ora-agent/i;

function acceptsMarkdown(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("text/markdown");
}

function prefersMarkdown(request: NextRequest): boolean {
	if (acceptsMarkdown(request)) return true;
	const userAgent = request.headers.get("user-agent") ?? "";
	return MARKDOWN_BOT_UA.test(userAgent);
}

function rewriteTo(request: NextRequest, pathname: string): NextResponse {
	const url = request.nextUrl.clone();
	url.pathname = pathname;
	url.search = "";
	const response = NextResponse.rewrite(url);
	response.headers.set("Vary", "Accept, User-Agent");
	return response;
}

// Path of the markdown twin for a page path, or undefined if there is none.
function markdownTwinFor(pathname: string): string | undefined {
	if (pathname === "/") return "/index.md";
	const bare = pathname.replace(/^\//, "");
	if (CATEGORY_SLUGS.includes(bare)) return `/md/category/${bare}`;
	if (PAGE_SLUGS.includes(bare)) return `/md/page/${bare}`;
	if (CONTENT_PAGE_PATTERN.test(pathname)) return `/md${pathname}`;
	return undefined;
}

function markdownNotFound(): NextResponse {
	return new NextResponse(markdownNotFoundBody(), {
		status: 404,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=300, s-maxage=300",
		},
	});
}

export default function proxy(request: NextRequest) {
	const { pathname, searchParams } = request.nextUrl;

	// Machine-readable homepage view for agents.
	if (pathname === "/" && searchParams.get("mode") === "agent") {
		return rewriteTo(request, "/agents.md");
	}

	// Explicit .md URLs: /pricing.md, /blog/foo.md, /parallel-coding-agents.md.
	if (pathname.endsWith(".md")) {
		if (MARKDOWN_ROUTES.has(pathname)) return NextResponse.next();
		const twinMatch = pathname.match(MD_TWIN_PATTERN);
		if (twinMatch) {
			return rewriteTo(request, `/md/${twinMatch[1]}/${twinMatch[2]}`);
		}
		const twin = markdownTwinFor(pathname.slice(0, -3));
		if (twin) return rewriteTo(request, twin);
		// Unknown .md path: a real 404 with a markdown body agents can follow.
		return markdownNotFound();
	}

	// Content negotiation (acceptmarkdown.com) and AI-bot UAs: serve the
	// markdown twin of any page that has one.
	if (prefersMarkdown(request)) {
		const twin = markdownTwinFor(pathname);
		if (twin) return rewriteTo(request, twin);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		// Everything except Next internals and static assets.
		"/((?!_next/|api/|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf|css|js|map|xml|txt|json)$).*)",
	],
};
