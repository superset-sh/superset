import { COMPANY } from "@superset/shared/constants";
import { FAQ_ITEMS } from "@/app/components/FAQSection/constants";
import {
	buildDeveloperResourcesSection,
	buildWhenToUseSection,
	MARKDOWN_HEADERS,
} from "@/lib/llms";

export async function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		`# ${COMPANY.NAME} — Run 10+ parallel coding agents on your machine`,
		"",
		`${COMPANY.NAME} is an open-source desktop application that lets developers run multiple AI coding agents in parallel, each in its own isolated Git worktree. It works with any CLI-based agent including Claude Code, OpenCode, and OpenAI Codex. Agents can work on different branches or features simultaneously without conflicts. ${COMPANY.NAME} is free, does not proxy API calls, and supports macOS with Windows and Linux coming soon.`,
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
