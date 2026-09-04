import type { MessageDescriptor } from "@lingui/core";
import { i18n, isSupportedLocale } from "@superset/i18n";
import {
	initServerI18n as activateServerI18n,
	preloadServerLocale,
} from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import { MCP_CAPABILITIES } from "@/app/[lang]/mcp-install/components/McpCapabilities/constants";
import {
	COMPARISON_SECTIONS,
	type ComparisonValue,
	PRICING_FAQ_ITEMS,
	PRICING_TIERS,
} from "@/app/[lang]/pricing/constants";
import { getBlogPost } from "@/lib/blog";
import { getCategoryPage } from "@/lib/category";
import { getChangelogEntry } from "@/lib/changelog";
import { getComparisonPage } from "@/lib/compare";
import {
	buildFrontmatter,
	MARKDOWN_HEADERS,
	MCP_SERVER_URL,
	stripMdxSyntax,
} from "@/lib/llms";
import { markdownNotFound } from "@/lib/markdown-not-found";
import { getAllPeople } from "@/lib/people";

interface MarkdownPage {
	title: string;
	url: string;
	date?: string;
	author?: string;
	description?: string;
	content: string;
}

// Pricing copy lives as Lingui message descriptors; this feed is plain text
// for LLM clients, so every descriptor is rendered before it is joined.
function text(value: string | MessageDescriptor): string {
	return typeof value === "string" ? value : i18n._(value);
}

function cell(value: ComparisonValue | null): string {
	if (value === true) return "Yes";
	if (value === false || value === null) return "No";
	return text(value);
}

function pricingPage(): MarkdownPage {
	const baseUrl = COMPANY.MARKETING_URL;
	const tiers = PRICING_TIERS.map((tier) => {
		const price =
			tier.price.kind === "variable"
				? `${tier.price.monthly.display} ${text(tier.price.monthly.note)} (${text(tier.price.monthly.cadence)}) or ${tier.price.yearly.display} ${text(tier.price.yearly.note)} (${text(tier.price.yearly.cadence)})`
				: `${text(tier.price.display)} (${text(tier.price.note)})`;
		return [
			`### ${text(tier.name)}`,
			"",
			text(tier.description),
			"",
			`- **Price**: ${price}`,
			...tier.features.map((feature) => `- ${text(feature.label)}`),
			`- [${text(tier.cta.label)}](${tier.cta.href.startsWith("/") ? baseUrl + tier.cta.href : tier.cta.href})`,
			"",
		];
	});
	const tierNames = PRICING_TIERS.map((tier) => text(tier.name));
	const comparison = COMPARISON_SECTIONS.flatMap((section) => [
		`### ${text(section.title)}`,
		"",
		`| | ${tierNames.join(" | ")} |`,
		`|---|${tierNames.map(() => "---").join("|")}|`,
		...section.rows.map(
			(row) =>
				`| ${text(row.label)}${row.badge ? ` (${text(row.badge.label)})` : ""} | ${row.values.map(cell).join(" | ")} |`,
		),
		"",
	]);
	const faq = PRICING_FAQ_ITEMS.flatMap((item) => [
		`### ${text(item.question)}`,
		"",
		text(item.answer),
		"",
	]);
	return {
		title: `${COMPANY.NAME} pricing`,
		url: `${baseUrl}/pricing`,
		description:
			"Free for individuals. Pro is $20 per user/month (or $15 billed yearly). Enterprise adds SSO, SCIM, audit logs, and an SLA.",
		content: [
			"## Plans",
			"",
			...tiers.flat(),
			"## Compare plans",
			"",
			...comparison,
			"## FAQ",
			"",
			...faq,
		].join("\n"),
	};
}

function mcpInstallPage(): MarkdownPage {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;
	return {
		title: `Install the ${COMPANY.NAME} MCP server in your client`,
		url: `${baseUrl}/mcp-install`,
		description: `Connect Claude, Codex, Cursor, or any MCP client to ${COMPANY.NAME}. Create tasks, spin up workspaces, launch agents, and run automations straight from your AI agent.`,
		content: [
			`Server URL: ${MCP_SERVER_URL} (Streamable HTTP). Authentication: OAuth 2.1 + PKCE with dynamic client registration, or a Superset API key as a Bearer token. Walkthrough: ${baseUrl}/auth.md`,
			"",
			"## Generic MCP client config",
			"",
			"```json",
			JSON.stringify(
				{ mcpServers: { superset: { type: "http", url: MCP_SERVER_URL } } },
				null,
				2,
			),
			"```",
			"",
			"## One-line installs",
			"",
			`- Claude Code: \`claude mcp add --transport http superset ${MCP_SERVER_URL}\``,
			`- Codex: \`codex mcp add superset --url ${MCP_SERVER_URL}\``,
			`- Other clients: see ${docsUrl}/mcp-server`,
			"",
			"## What the server can do",
			"",
			...MCP_CAPABILITIES.map(
				(capability) =>
					`- **${text(capability.category)}**: ${text(capability.description)}`,
			),
			"",
			"## Resources",
			"",
			`- [MCP server docs](${docsUrl}/mcp-server)`,
			`- [MCP server card](${baseUrl}/.well-known/mcp/server-card.json): full tool catalog with input schemas`,
			`- [Agent auth guide](${baseUrl}/auth.md)`,
		].join("\n"),
	};
}

function teamPage(): MarkdownPage {
	const baseUrl = COMPANY.MARKETING_URL;
	const people = getAllPeople();
	return {
		title: `About ${COMPANY.NAME}`,
		url: `${baseUrl}/team`,
		description:
			"What Superset is, who builds it, and who it's for. A San Francisco team of three ex-YC CTOs building the workspace for parallel coding agents.",
		content: [
			"## Team",
			"",
			...people.flatMap((person) => [
				`### ${person.name}`,
				"",
				person.role,
				...(person.bio ? ["", person.bio] : []),
				...(person.github ? [`- GitHub: ${person.github}`] : []),
				...(person.twitter ? [`- X: ${person.twitter}`] : []),
				...(person.linkedin ? [`- LinkedIn: ${person.linkedin}`] : []),
				"",
			]),
			"## Contact",
			"",
			`- Founders: ${COMPANY.FOUNDERS_EMAIL}`,
			`- [Join us](${COMPANY.JOIN_US_URL})`,
		].join("\n"),
	};
}

function enterprisePage(): MarkdownPage {
	const baseUrl = COMPANY.MARKETING_URL;
	const enterprise = PRICING_TIERS.find((tier) => tier.id === "enterprise");
	return {
		title: `${COMPANY.NAME} for enterprise`,
		url: `${baseUrl}/enterprise`,
		description: `Bring ${COMPANY.NAME} to your team. Enterprise plans add SSO, SCIM, audit logs, an uptime SLA, and custom contracts.`,
		content: [
			"## What Enterprise includes",
			"",
			...(enterprise?.features ?? []).map(
				(feature) => `- ${text(feature.label)}`,
			),
			"",
			"## Where your code runs",
			"",
			"On your machines. Repos, worktrees, terminal output, and agent sessions stay local by default; cloud sync covers account and organization metadata only. Superset never proxies model API calls.",
			"",
			"## Get in touch",
			"",
			`- Contact sales: ${baseUrl}/enterprise`,
			`- Security and compliance: ${COMPANY.TRUST_URL}`,
			`- Email: ${COMPANY.FOUNDERS_EMAIL}`,
		].join("\n"),
	};
}

const STATIC_PAGES: Record<string, () => MarkdownPage> = {
	pricing: pricingPage,
	"mcp-install": mcpInstallPage,
	team: teamPage,
	enterprise: enterprisePage,
};

function loadPage(section: string, slug: string): MarkdownPage | undefined {
	const baseUrl = COMPANY.MARKETING_URL;
	if (section === "page") {
		return STATIC_PAGES[slug]?.();
	}
	if (section === "blog") {
		const post = getBlogPost(slug);
		if (!post) return undefined;
		return {
			title: post.title,
			url: `${baseUrl}/blog/${post.slug}`,
			date: post.date,
			author: post.author.name,
			description: post.description,
			content: stripMdxSyntax(post.content),
		};
	}
	if (section === "compare") {
		const page = getComparisonPage(slug);
		if (!page) return undefined;
		return {
			title: page.title,
			url: `${baseUrl}/compare/${page.slug}`,
			date: page.lastUpdated ?? page.date,
			description: page.description,
			content: stripMdxSyntax(page.content),
		};
	}
	if (section === "category") {
		const page = getCategoryPage(slug);
		if (!page) return undefined;
		return {
			title: page.title,
			url: `${baseUrl}${page.url}`,
			date: page.lastUpdated ?? page.date,
			description: page.description,
			content: stripMdxSyntax(page.content),
		};
	}
	if (section === "changelog") {
		const entry = getChangelogEntry(slug);
		if (!entry || entry.draft) return undefined;
		return {
			title: entry.title,
			url: `${baseUrl}/changelog/${entry.slug}`,
			date: entry.date,
			description: entry.description,
			content: stripMdxSyntax(entry.content),
		};
	}
	return undefined;
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ lang: string; path: string[] }> },
) {
	// Route handlers render outside the root layout, so the shared i18n
	// instance is not seeded for them. Activate the language the URL names —
	// /md/... is English, /ja/md/... is Japanese.
	//
	// The locale comes from the route's own params rather than
	// next/root-params: [lang] is a parent segment, so it is already in
	// params here, and that works the same in a route handler as in a server
	// component. app/i18n-server.ts reads root-params instead, which is a
	// server-component API — using it here would risk 404ing every twin.
	const { lang, path } = await params;
	if (!isSupportedLocale(lang)) return markdownNotFound();
	await preloadServerLocale(lang);
	activateServerI18n(lang);
	const locale = lang;
	const [section, slug] = path;
	const page =
		path.length === 2 && section && slug ? loadPage(section, slug) : undefined;
	if (!page) {
		return markdownNotFound();
	}

	// The document a localized twin is the markdown of is the localized page,
	// not the English one.
	const canonical =
		locale === "en"
			? page.url
			: page.url.replace(
					COMPANY.MARKETING_URL,
					`${COMPANY.MARKETING_URL}/${locale}`,
				);

	const lines = [
		...buildFrontmatter({
			title: page.title,
			description: page.description ?? page.title,
			canonical,
			lastUpdated: page.date,
		}),
		`# ${page.title}`,
		"",
		...(page.description ? [page.description, ""] : []),
		`URL: ${canonical}`,
		...(page.date ? [`Date: ${page.date}`] : []),
		...(page.author ? [`Author: ${page.author}`] : []),
		"",
		page.content,
		"",
	];

	return new Response(lines.join("\n"), { headers: MARKDOWN_HEADERS });
}
