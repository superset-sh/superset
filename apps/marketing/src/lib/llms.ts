import { COMPANY } from "@superset/shared/constants";
import {
	FAQ_ITEMS,
	faqSourceText,
} from "@/app/[lang]/components/FAQSection/constants";
import { API_URL, MCP_SERVER_URL } from "./api-url";
import { getBlogPosts } from "./blog";
import { getCategoryPages } from "./category";
import { getComparisonPages } from "./compare";
import { PRODUCT_SUMMARY } from "./product-facts";

export { API_URL, MCP_SERVER_URL };

export function stripMdxSyntax(content: string): string {
	return (
		content
			// Remove import statements
			.replace(/^import\s+.*$/gm, "")
			// Remove JSX component tags (e.g. <Video ... />, <Component>...</Component>)
			.replace(/<[A-Z]\w*\b[^>]*\/>/g, "")
			.replace(/<[A-Z]\w*\b[^>]*>[\s\S]*?<\/[A-Z]\w*>/g, "")
			// Clean up excessive blank lines
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

export { PRODUCT_SUMMARY } from "./product-facts";

// Canonical company/product facts for agents researching Superset. LLMs have
// hallucinated these before (calling Superset fully open source, or macOS-only
// forever, or conflating it with Apache Superset), so state them explicitly.
export function buildCompanyFactsSection(): string[] {
	const baseUrl = COMPANY.MARKETING_URL;
	return [
		"## Facts about Superset",
		"",
		`- **What it is**: a local-first desktop workspace for orchestrating any CLI-based coding agent. Each task runs in an isolated Git worktree, and Superset provides the stable workflow around the agents.`,
		`- **Company**: built by ${COMPANY.NAME} in San Francisco, founded by three former YC CTOs (see ${baseUrl}/team).`,
		`- **License**: source-available under Elastic License 2.0 (ELv2). The code is public on GitHub (${COMPANY.GITHUB_URL}); it is not OSI-approved open source.`,
		`- **Not Apache Superset**: Superset (superset.sh) is unrelated to Apache Superset, the business-intelligence tool.`,
		`- **Platforms**: macOS today, experimental Linux AppImage; Windows is not yet available. There is also a CLI, a TypeScript SDK, and an MCP server for programmatic control.`,
		`- **Pricing**: free tier plus paid seats (see ${baseUrl}/pricing). Superset never proxies model API calls; you bring your own agent subscriptions and API keys.`,
		`- **Agents**: works with any CLI coding agent, including Claude Code, OpenAI Codex, OpenCode, Gemini CLI, Copilot, and Cursor Agent.`,
	];
}

export function buildLlmsHeader(): string[] {
	return [
		`# ${COMPANY.NAME}`,
		"",
		"> Bring any coding agent. Orchestrate them all.",
		"",
		PRODUCT_SUMMARY,
	];
}

export function buildWhenToUseSection(): string[] {
	return [
		"## When to use Superset",
		"",
		"Reach for Superset when you need to:",
		"",
		"- Run several coding agents (Claude Code, Codex, OpenCode, or any CLI agent) at the same time on one repository without them stepping on each other. Each agent gets an isolated Git worktree and its own branch.",
		"- Orchestrate agent work programmatically: create workspaces, launch agents with a prompt, open terminals, and track tasks from another agent or script via the Superset MCP server.",
		"- Schedule recurring agent runs (automations) that execute a prompt on a cron-like schedule in a fresh or existing workspace.",
		"- Review diffs, manage ports, and monitor many concurrent agent sessions from one dashboard.",
		"",
		"Superset is not a coding agent itself; it is the workspace and orchestration layer the agents run in. If you are an AI agent, the fastest way to act on a user's Superset account is the MCP server below (OAuth or API key auth); the fastest way to learn the product is the docs index at https://docs.superset.sh.",
	];
}

export function buildDeveloperResourcesSection(): string[] {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;
	return [
		"## Developer resources",
		"",
		`- [API docs](${docsUrl}/mcp-server): Superset MCP server documentation`,
		`- [OpenAPI spec](${API_URL}/openapi.json): OpenAPI 3.1 description of the Superset API surface`,
		`- [MCP server](${MCP_SERVER_URL}): Model Context Protocol server (Streamable HTTP transport) with tools for tasks, workspaces, agents, automations, terminals, hosts, and projects; full catalog in the server card. Legacy alias: ${API_URL}/api/v2/agent/mcp`,
		`- [Docs MCP server](${docsUrl}/mcp): search and read the Superset documentation over MCP (Streamable HTTP, no auth)`,
		`- [MCP server card](${baseUrl}/.well-known/mcp/server-card.json): machine-readable MCP server description`,
		`- [A2A agent card](${baseUrl}/.well-known/agent-card.json): Agent-to-Agent capability card`,
		`- [API catalog](${baseUrl}/.well-known/api-catalog): RFC 9727 linkset of API resources`,
		`- [AI catalog](${baseUrl}/.well-known/ai-catalog.json): Agentic Resource Discovery catalog of every MCP server, agent card, skill, and API Superset publishes`,
		`- [Auth guide for agents](${baseUrl}/auth.md): how agents obtain credentials (OAuth 2.1 + PKCE with dynamic client registration, or API keys)`,
		`- [Agent instructions](${baseUrl}/agents.md): when and how AI agents should use Superset`,
		`- [OAuth protected resource metadata](${API_URL}/.well-known/oauth-protected-resource): RFC 9728`,
		`- [OAuth authorization server metadata](${API_URL}/.well-known/oauth-authorization-server): RFC 8414`,
		`- [Web Bot Auth key directory](${baseUrl}/.well-known/http-message-signatures-directory): Ed25519 keys Superset-operated agents sign requests with (RFC 9421)`,
		`- [Agent skills](https://github.com/superset-sh/skills): official skills for the CLI and MCP server; install with \`npx skills add superset-sh/skills\``,
		`- [CLI](${docsUrl}/cli/getting-started): \`brew install superset-sh/tap/superset\` (Homebrew tap: https://github.com/superset-sh/homebrew-tap) or \`curl -fsSL https://superset.sh/cli/install.sh | sh\`; reference at ${docsUrl}/cli/cli-reference`,
		`- [TypeScript SDK](${docsUrl}/sdk/getting-started): \`npm install @superset_sh/sdk\``,
		`- [Docs llms.txt](${docsUrl}/llms.txt): scoped context for the documentation`,
		`- [API llms.txt](${baseUrl}/api/llms.txt): scoped index of the API surface`,
		`- [Blog llms.txt](${baseUrl}/blog/llms.txt): scoped index of blog posts`,
		`- [Compare llms.txt](${baseUrl}/compare/llms.txt): scoped index of comparison pages`,
	];
}

export function buildLlmsTxt(): string {
	const posts = getBlogPosts();
	const comparisons = getComparisonPages();
	const categories = getCategoryPages();
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		...buildLlmsHeader(),
		"",
		...buildCompanyFactsSection(),
		"",
		...buildWhenToUseSection(),
		"",
		...buildDeveloperResourcesSection(),
		"",
		"## Docs",
		"",
		`- [Documentation](${docsUrl})`,
		`- [Getting Started](${docsUrl}/getting-started)`,
		`- [GitHub](${COMPANY.GITHUB_URL})`,
		"",
		"## Blog",
		"",
		...posts.map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug})`),
		"",
		"## Guides",
		"",
		...categories.map((page) => `- [${page.title}](${baseUrl}${page.url})`),
		"",
		"## Comparisons",
		"",
		...comparisons.map(
			(page) => `- [${page.title}](${baseUrl}/compare/${page.slug})`,
		),
		"",
		"## FAQ",
		"",
		...FAQ_ITEMS.flatMap((item) => [
			`### ${faqSourceText(item.question)}`,
			"",
			faqSourceText(item.answer),
			"",
		]),
	];

	return lines.join("\n");
}

export const MARKDOWN_HEADERS = {
	"Content-Type": "text/markdown; charset=utf-8",
	"Cache-Control": "public, max-age=3600, s-maxage=3600",
	Vary: "Accept",
} as const;

// Module-evaluation time: the build for statically generated routes, the cold
// start for dynamic ones. Good enough as "when this document was generated".
const GENERATED_AT = new Date().toISOString().slice(0, 10);

export interface MarkdownFrontmatter {
	title: string;
	description: string;
	canonical: string;
	lastUpdated?: string;
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

// YAML frontmatter block so agents get title/description/canonical without
// scraping the body. Keep it first in the response.
export function buildFrontmatter(meta: MarkdownFrontmatter): string[] {
	return [
		"---",
		`title: ${yamlString(meta.title)}`,
		`description: ${yamlString(meta.description)}`,
		`canonical: ${meta.canonical}`,
		`last-updated: ${meta.lastUpdated ?? GENERATED_AT}`,
		"---",
		"",
	];
}
