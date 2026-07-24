import { COMPANY } from "@superset/shared/constants";
import { FAQ_ITEMS } from "@/app/components/FAQSection/constants";
import { getBlogPosts } from "./blog";
import { getComparisonPages } from "./compare";

export const API_URL = "https://api.superset.sh";
export const MCP_SERVER_URL = `${API_URL}/api/v2/agent/mcp`;

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

export function buildLlmsHeader(): string[] {
	return [
		`# ${COMPANY.NAME}`,
		"",
		"> Run 10+ parallel coding agents on your machine",
		"",
		`${COMPANY.NAME} is an open-source desktop application that lets developers run multiple AI coding agents in parallel, each in its own isolated Git worktree. It works with any CLI-based agent including Claude Code, OpenCode, and OpenAI Codex. Agents can work on different branches or features simultaneously without conflicts. ${COMPANY.NAME} is free, does not proxy API calls, and supports macOS with Windows and Linux coming soon.`,
	];
}

export function buildWhenToUseSection(): string[] {
	return [
		"## When to use Superset",
		"",
		"Reach for Superset when you need to:",
		"",
		"- Run several coding agents (Claude Code, Codex, OpenCode, or any CLI agent) at the same time on one repository without them stepping on each other — each agent gets an isolated Git worktree and its own branch.",
		"- Orchestrate agent work programmatically: create workspaces, launch agents with a prompt, open terminals, and track tasks from another agent or script via the Superset MCP server.",
		"- Schedule recurring agent runs (automations) that execute a prompt on a cron-like schedule in a fresh or existing workspace.",
		"- Review diffs, manage ports, and monitor many concurrent agent sessions from one dashboard.",
		"",
		"Superset is not a coding agent itself — it is the workspace and orchestration layer the agents run in. If you are an AI agent, the fastest way to act on a user's Superset account is the MCP server below (OAuth or API key auth); the fastest way to learn the product is the docs index at https://docs.superset.sh.",
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
		`- [MCP server](${MCP_SERVER_URL}): Model Context Protocol server (Streamable HTTP transport) — 27 tools for tasks, workspaces, agents, automations, terminals, hosts, and projects. Alias: ${API_URL}/mcp`,
		`- [Docs MCP server](${docsUrl}/mcp): search and read the Superset documentation over MCP (Streamable HTTP, no auth)`,
		`- [MCP server card](${baseUrl}/.well-known/mcp/server-card.json): machine-readable MCP server description`,
		`- [A2A agent card](${baseUrl}/.well-known/agent-card.json): Agent-to-Agent capability card`,
		`- [API catalog](${baseUrl}/.well-known/api-catalog): RFC 9727 linkset of API resources`,
		`- [Auth guide for agents](${baseUrl}/auth.md): how agents obtain credentials (OAuth 2.1 + PKCE with dynamic client registration, or API keys)`,
		`- [Agent instructions](${baseUrl}/agents.md): when and how AI agents should use Superset`,
		`- [OAuth protected resource metadata](${API_URL}/.well-known/oauth-protected-resource): RFC 9728`,
		`- [OAuth authorization server metadata](${API_URL}/.well-known/oauth-authorization-server): RFC 8414`,
		`- [CLI](${docsUrl}/cli/getting-started): \`brew install superset-sh/tap/superset\` or \`curl -fsSL https://superset.sh/cli/install.sh | sh\``,
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
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		...buildLlmsHeader(),
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
		"## Comparisons",
		"",
		...comparisons.map(
			(page) => `- [${page.title}](${baseUrl}/compare/${page.slug})`,
		),
		"",
		"## FAQ",
		"",
		...FAQ_ITEMS.flatMap((item) => [
			`### ${item.question}`,
			"",
			item.answer,
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
