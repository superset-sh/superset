import { COMPANY } from "@superset/shared/constants";

const WELCOME_AI_AGENTS = [
	"GPTBot",
	"ChatGPT-User",
	"OAI-SearchBot",
	"ClaudeBot",
	"Claude-User",
	"Claude-SearchBot",
	"anthropic-ai",
	"PerplexityBot",
	"Perplexity-User",
	"Google-Extended",
	"GoogleOther",
	"Applebot-Extended",
	"DuckAssistBot",
	"Meta-ExternalAgent",
	"ora-agent",
];

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;

	const content = `# Default: open to all crawlers
User-Agent: *
Allow: /
Allow: /api/llms.txt
Disallow: /api/
Disallow: /_next/

# AI assistants and AI search crawlers: explicitly welcome
${WELCOME_AI_AGENTS.map((agent) => `User-Agent: ${agent}\nAllow: /`).join("\n\n")}

# Bulk-scraping crawlers: not welcome
User-Agent: CCBot
Disallow: /

User-Agent: Bytespider
Disallow: /

# Content Signals (https://contentsignals.org)
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${baseUrl}/sitemap.xml

# Agent discovery
Agentmap: ${baseUrl}/.well-known/ai-catalog.json
schemamap: ${baseUrl}/schemamap.xml
`;

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
