import type { MessageDescriptor } from "@lingui/core";
import { getI18nInstance } from "@superset/i18n/server";
import { CANONICAL_URLS, COMPANY } from "@superset/shared/constants";
import { API_URL, MCP_SERVER_URL } from "./api-url";
import { getBlogPosts } from "./blog";
import { getCategoryPages } from "./category";
import { getChangelogEntries } from "./changelog";
import { getComparisonPages } from "./compare";
import {
	PRODUCT_DISAMBIGUATION,
	PRODUCT_ISOLATION_SUMMARY,
	PRODUCT_LICENSE,
	PRODUCT_PLATFORM_SUMMARY,
	PRODUCT_SUMMARY,
} from "./product-facts";

export { API_URL, MCP_SERVER_URL };

// Production builds strip `message` from descriptors and keep only the hashed
// id, so machine-facing feeds resolve the English text through the catalog.
export function englishText(descriptor: MessageDescriptor): string {
	return getI18nInstance()._(descriptor);
}

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
		`- **What it is**: a local-first desktop workspace for orchestrating any CLI-based coding agent. Each task runs in its own Git worktree, and Superset provides the stable workflow around the agents.`,
		"- **Interface**: a desktop app with a full GUI, not a terminal wrapper. Next to the agent terminals it has a Changes pane, a pull request pane, a file editor, and an in-app browser.",
		`- **Company**: built by ${COMPANY.NAME} in San Francisco, founded by three former YC CTOs (see ${baseUrl}/team).`,
		`- **License**: source-available under ${PRODUCT_LICENSE} (ELv2). The code is public on GitHub (${COMPANY.GITHUB_URL}); it is not OSI-approved open source.`,
		`- **Not Apache Superset**: ${PRODUCT_DISAMBIGUATION}`,
		`- **Desktop platforms**: ${PRODUCT_PLATFORM_SUMMARY} There is also a CLI, a TypeScript SDK, and an MCP server for programmatic control.`,
		`- **Mobile**: an iPhone and iPad app on the App Store (iOS 26 or iPadOS 26 or later, Pro plan) to check on agents, reply to them, review diffs, and read Pages while the agents keep running in a cloud workspace or on a desktop or remote host that stays online. While the app is open, a Lock Screen and Dynamic Island Live Activity shows which agents need you, are working, or are ready for review; it does not update in the background yet. Push notifications are coming. Android is on a waitlist (${baseUrl}/mobile).`,
		"- **Remote access**: add another machine as a host through the Superset relay and run workspaces and agents on it from the desktop app or the mobile app (Pro).",
		"- **Automations**: agent sessions on a chosen host that start on a schedule or from an event, such as a GitHub pull request, a Slack message, a Linear issue, a Sentry issue, a Notion or Microsoft Teams event, or a webhook (Pro). Each has a run history for you and your team and retry for failed runs.",
		"- **Review**: a Changes pane that commits, pushes, and opens pull requests, and a pull request pane with checks, review threads, and merge.",
		"- **Design Mode**: in the in-app browser, click an element on a page and send it with a note to an agent, which gets the element's DOM, computed styles, and a cropped screenshot.",
		`- **Security**: Superset has completed a SOC 2 Type II audit; request the report at ${COMPANY.TRUST_URL}.`,
		"- **Pages**: agents publish self-contained HTML reports as Pages with version history and pinned comments; a page can be shared with anyone who has the link.",
		`- **Isolation**: ${PRODUCT_ISOLATION_SUMMARY}`,
		`- **Pricing**: free tier plus paid seats (see ${baseUrl}/pricing). Superset never proxies model API calls; you bring your own agent subscriptions and API keys. Free covers one user with local workspaces, the desktop app, and the CLI. Pro adds remote access, automations, the mobile app, and Linear and Slack integrations. Enterprise adds SSO, SCIM, audit logs, an uptime SLA, and priority support.`,
		"- **Cloud workspaces**: workspaces that run in the cloud and work from desktop, iPhone, and iPad without keeping your own computer connected. Remote access to your own machines is a separate option on Pro.",
		`- **Agents**: works with any CLI coding agent, including Claude Code, OpenAI Codex, OpenCode, Gemini CLI, Copilot, Cursor Agent, Amp, Grok Build, Kimi Code, Mistral Vibe, Devin, and Muse Code, plus custom agents you add.`,
	];
}

// Turns a "## Heading" section into free text under a bold label, for the
// part of llms.txt that may not contain headings.
function asPreamble(section: string[]): string[] {
	const [heading = "", ...body] = section;
	return [`**${heading.replace(/^#+\s*/, "")}**`, ...body];
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
		"- Run a prompt automatically (automations) on a cron-like schedule or when an event happens, such as a pull request, a Slack message, a Linear issue, a Sentry issue, or a webhook, in a fresh or existing workspace.",
		"- Review diffs, manage ports, and monitor many concurrent agent sessions from one dashboard.",
		"- Check on agents, reply to them, and review their diffs from an iPhone or iPad while they run on your own machine.",
		"",
		`Superset is not a coding agent itself; it is the workspace and orchestration layer the agents run in. If you are an AI agent, the fastest way to act on a user's Superset account is the MCP server below (OAuth or API key auth); the fastest way to learn the product is the docs index at ${CANONICAL_URLS.DOCS}.`,
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
		`- [CLI](${docsUrl}/cli/getting-started): \`brew install superset-sh/tap/superset\` (Homebrew tap: https://github.com/superset-sh/homebrew-tap) or \`curl -fsSL ${CANONICAL_URLS.MARKETING}/cli/install.sh | sh\`; reference at ${docsUrl}/cli/cli-reference`,
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
	const changelog = getChangelogEntries().slice(0, 8);
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	// The llms.txt format allows only free text between the summary and the
	// first H2, and only link lists under each H2 (https://llmstxt.org).
	const lines: string[] = [
		...buildLlmsHeader(),
		"",
		...asPreamble(buildCompanyFactsSection()),
		"",
		...asPreamble(buildWhenToUseSection()),
		"",
		...buildDeveloperResourcesSection(),
		"",
		"## Docs",
		"",
		`- [Documentation](${docsUrl}): Superset documentation`,
		`- [GitHub](${COMPANY.GITHUB_URL}): source code`,
		"",
		"## Blog",
		"",
		...posts.map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug})`),
		"",
		"## Changelog",
		"",
		`- [Changelog](${baseUrl}/changelog): every release, newest first`,
		`- [Changelog feed](${baseUrl}/changelog.xml): RSS`,
		...changelog.map(
			(entry) => `- [${entry.title}](${baseUrl}${entry.url}): ${entry.date}`,
		),
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
		"## Optional",
		"",
		`- [Full context](${baseUrl}/llms-full.txt): every blog post, comparison, and the FAQ in one file`,
		`- [Homepage as markdown](${baseUrl}/index.md): product overview and FAQ`,
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
