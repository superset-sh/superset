import { type NextRequest, NextResponse } from "next/server";

const MD_TWIN_PATTERN = /^\/(blog|compare)\/([^/]+)\.md$/;

function acceptsMarkdown(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("text/markdown");
}

function rewriteTo(request: NextRequest, pathname: string): NextResponse {
	const url = request.nextUrl.clone();
	url.pathname = pathname;
	url.search = "";
	const response = NextResponse.rewrite(url);
	response.headers.set("Vary", "Accept");
	return response;
}

export default function proxy(request: NextRequest) {
	const { pathname, searchParams } = request.nextUrl;

	if (pathname === "/") {
		// Machine-readable homepage view for agents.
		if (searchParams.get("mode") === "agent") {
			return rewriteTo(request, "/agents.md");
		}
		// Markdown content negotiation (acceptmarkdown.com).
		if (acceptsMarkdown(request)) {
			return rewriteTo(request, "/index.md");
		}
		return NextResponse.next();
	}

	// .md twins for content pages: /blog/foo.md -> markdown source.
	const twinMatch = pathname.match(MD_TWIN_PATTERN);
	if (twinMatch) {
		return rewriteTo(request, `/md/${twinMatch[1]}/${twinMatch[2]}`);
	}

	// Accept negotiation on content pages that have a markdown twin. Segments
	// with an extension (llms.txt, feed.xml) are files, not pages — skip them.
	if (/^\/(blog|compare)\/[^/.]+$/.test(pathname) && acceptsMarkdown(request)) {
		return rewriteTo(request, `/md${pathname}`);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/", "/blog/:slug", "/compare/:slug"],
};
