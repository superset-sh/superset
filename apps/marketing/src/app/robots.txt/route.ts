import { COMPANY } from "@superset/shared/constants";

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;

	const content = `# Default: open to all crawlers
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /_next/

# AI assistants and AI search crawlers — explicitly welcome
User-Agent: ChatGPT-User
Allow: /

User-Agent: OAI-SearchBot
Allow: /

User-Agent: Claude-User
Allow: /

User-Agent: Claude-SearchBot
Allow: /

User-Agent: PerplexityBot
Allow: /

User-Agent: GoogleOther
Allow: /

# Bulk-scraping crawlers — not welcome
User-Agent: CCBot
Disallow: /

User-Agent: Bytespider
Disallow: /

# Content Signals (https://contentsignals.org)
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${baseUrl}/sitemap.xml
`;

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
