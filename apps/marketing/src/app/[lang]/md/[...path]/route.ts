import type { I18n, MessageDescriptor } from "@lingui/core";
import { isSupportedLocale } from "@superset/i18n";
import { getI18nInstance, preloadServerLocale } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import { MCP_CAPABILITIES } from "@/app/[lang]/mcp-install/components/McpCapabilities/constants";
import {
	COMPARISON_SECTIONS,
	type ComparisonValue,
	PRICING_FAQ_ITEMS,
	PRICING_TIERS,
} from "@/app/[lang]/pricing/constants";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";
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
import { renderProfileMarkdown } from "@/lib/profile-markdown";

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
function text(i18n: I18n, value: string | MessageDescriptor): string {
	return typeof value === "string" ? value : i18n._(value);
}

function cell(i18n: I18n, value: ComparisonValue | null): string {
	if (value === true) return "Yes";
	if (value === false || value === null) return "No";
	return text(i18n, value);
}

function pricingPage(i18n: I18n): MarkdownPage {
	const baseUrl = COMPANY.MARKETING_URL;
	const tiers = PRICING_TIERS.map((tier) => {
		const price =
			tier.price.kind === "variable"
				? `${tier.price.monthly.display} ${text(i18n, tier.price.monthly.note)} (${text(i18n, tier.price.monthly.cadence)}) or ${tier.price.yearly.display} ${text(i18n, tier.price.yearly.note)} (${text(i18n, tier.price.yearly.cadence)})`
				: `${text(i18n, tier.price.display)} (${text(i18n, tier.price.note)})`;
		return [
			`### ${text(i18n, tier.name)}`,
			"",
			text(i18n, tier.description),
			"",
			`- **Price**: ${price}`,
			...tier.features.map((feature) => `- ${text(i18n, feature.label)}`),
			`- [${text(i18n, tier.cta.label)}](${tier.cta.href.startsWith("/") ? baseUrl + tier.cta.href : tier.cta.href})`,
			"",
		];
	});
	const tierNames = PRICING_TIERS.map((tier) => text(i18n, tier.name));
	const comparison = COMPARISON_SECTIONS.flatMap((section) => [
		`### ${text(i18n, section.title)}`,
		"",
		`| | ${tierNames.join(" | ")} |`,
		`|---|${tierNames.map(() => "---").join("|")}|`,
		...section.rows.map(
			(row) =>
				`| ${text(i18n, row.label)}${row.badge ? ` (${text(i18n, row.badge.label)})` : ""} | ${row.values.map((value) => cell(i18n, value)).join(" | ")} |`,
		),
		"",
	]);
	const faq = PRICING_FAQ_ITEMS.flatMap((item) => [
		`### ${text(i18n, item.question)}`,
		"",
		text(i18n, item.answer),
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

function mcpInstallPage(i18n: I18n): MarkdownPage {
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
					`- **${text(i18n, capability.category)}**: ${text(i18n, capability.description)}`,
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

function enterprisePage(i18n: I18n): MarkdownPage {
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
				(feature) => `- ${text(i18n, feature.label)}`,
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

const STATIC_PAGES: Record<string, (i18n: I18n) => MarkdownPage> = {
	pricing: pricingPage,
	"mcp-install": mcpInstallPage,
	team: teamPage,
	enterprise: enterprisePage,
};

async function loadPage(
	i18n: I18n,
	section: string,
	slug: string,
): Promise<MarkdownPage | undefined> {
	const baseUrl = COMPANY.MARKETING_URL;
	if (section === "page") {
		return STATIC_PAGES[slug]?.(i18n);
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
	if (section === "user") {
		const profile = await fetchParticipant(slug.toLowerCase(), {
			period: "all",
		});
		if (!profile) return undefined;
		const tier = profile.factory?.tier ?? 0;
		return {
			title: `${profile.name ?? profile.handle} (@${profile.handle})`,
			url: `${baseUrl}/${profile.handle}`,
			description: `Rank #${profile.rank} of ${profile.total} on the ${COMPANY.NAME} leaderboard, tier ${tier}.`,
			content: renderProfileMarkdown(profile),
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
	// Route handlers run outside RSC. Resolve their explicit URL params and
	// pass the locale instance to utilities instead of using React's cache.
	const { lang, path } = await params;
	if (!isSupportedLocale(lang)) return markdownNotFound();
	await preloadServerLocale(lang);
	const i18n = getI18nInstance(lang);
	const locale = lang;
	const [section, slug] = path;
	let page: MarkdownPage | undefined;
	try {
		page =
			path.length === 2 && section && slug
				? await loadPage(i18n, section, slug)
				: undefined;
	} catch (error) {
		console.error("[marketing/md] page load failed:", error);
		return new Response("Temporarily unavailable\n", {
			status: 503,
			headers: {
				"content-type": "text/markdown; charset=utf-8",
				"cache-control": "no-store",
				"retry-after": "30",
			},
		});
	}
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
