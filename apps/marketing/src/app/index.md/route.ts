import { COMPANY } from "@superset/shared/constants";
import { FAQ_ITEMS } from "@/app/components/FAQSection/constants";
import {
	buildCompanyFactsSection,
	buildDeveloperResourcesSection,
	buildFrontmatter,
	buildWhenToUseSection,
	MARKDOWN_HEADERS,
	PRODUCT_SUMMARY,
} from "@/lib/llms";

export async function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const guideLines = [
		"## Guides",
		"",
		`- [Parallel Coding Agents: The Complete Guide](${baseUrl}/parallel-coding-agents)`,
		`- [AI Agent Orchestration for Software Development](${baseUrl}/agent-orchestration)`,
		"",
	];

	const lines: string[] = [
		...buildFrontmatter({
			title: `${COMPANY.NAME}: Run 100+ parallel coding agents on your machine`,
			description: PRODUCT_SUMMARY,
			canonical: `${baseUrl}/`,
		}),
		`# ${COMPANY.NAME}: Run 100+ parallel coding agents on your machine`,
		"",
		PRODUCT_SUMMARY,
		"",
		...buildCompanyFactsSection(),
		"",
		"## Features",
		"",
		"- **Parallel agents**: run many coding agents side by side, each in an isolated Git worktree on its own branch.",
		"- **Any CLI agent**: Claude Code, OpenAI Codex, OpenCode, and anything else that runs in a terminal.",
		"- **Diff review**: review every change from one dashboard before merging.",
		"- **Persistent terminals**: sessions survive app restarts.",
		"- **Automations**: schedule recurring agent runs with a prompt.",
		"- **MCP server**: drive Superset from other AI agents over the Model Context Protocol.",
		"",
		"## Get started",
		"",
		`- [Download for macOS](${baseUrl}/download)`,
		`- [Documentation](${docsUrl})`,
		`- [GitHub](${COMPANY.GITHUB_URL})`,
		`- [Pricing](${baseUrl}/pricing)`,
		`- [Blog](${baseUrl}/blog)`,
		`- [Changelog](${baseUrl}/changelog)`,
		"",
		...guideLines,
		...buildWhenToUseSection(),
		"",
		...buildDeveloperResourcesSection(),
		"",
		"## FAQ",
		"",
		...FAQ_ITEMS.flatMap((item) => [
			`### ${item.question}`,
			"",
			item.answer,
			"",
		]),
		`## Contact`,
		"",
		`- Support: support${COMPANY.EMAIL_DOMAIN}`,
		`- Founders: ${COMPANY.FOUNDERS_EMAIL}`,
		`- [Discord](${COMPANY.DISCORD_URL})`,
		`- [X](${COMPANY.X_URL})`,
		`- [Status](${COMPANY.STATUS_URL})`,
	];

	return new Response(lines.join("\n"), { headers: MARKDOWN_HEADERS });
}
