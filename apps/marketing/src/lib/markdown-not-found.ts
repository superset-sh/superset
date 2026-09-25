import { COMPANY } from "@superset/shared/constants";

// A 404 agents can recover from: real status code, markdown body, pointers to
// the indexes worth trying next. Safe to import from the edge proxy.
export function markdownNotFoundBody(): string {
	const baseUrl = COMPANY.MARKETING_URL;
	return [
		"# Not found",
		"",
		`There is no document at this path on ${baseUrl}. Where to look next:`,
		"",
		`- [llms.txt](${baseUrl}/llms.txt): index of everything agents can read here`,
		`- [index.md](${baseUrl}/index.md): the homepage as markdown`,
		`- [sitemap.xml](${baseUrl}/sitemap.xml): every page URL`,
		`- [agents.md](${baseUrl}/agents.md): API surface and auth for agents`,
		`- [Documentation](${COMPANY.DOCS_URL}) and its [llms.txt](${COMPANY.DOCS_URL}/llms.txt)`,
		"",
		"Content pages under /blog, /compare, /changelog, /pricing, /team, /mcp-install, and /enterprise serve markdown when you append `.md` or send `Accept: text/markdown`.",
		"",
	].join("\n");
}

export function markdownNotFound(): Response {
	return new Response(markdownNotFoundBody(), {
		status: 404,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=300, s-maxage=300",
		},
	});
}
