import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { ReactNode } from "react";

export interface NavLink {
	href: string;
	label: ReactNode;
	description?: ReactNode;
	badge?: ReactNode;
	external?: boolean;
}

export interface NavSection {
	id: string;
	title: ReactNode;
	links: NavLink[];
}

export const PRODUCT_SECTIONS: NavSection[] = [
	{
		id: "products",
		title: <Trans>Products</Trans>,
		links: [
			{
				href: "/",
				label: <Trans>Desktop app</Trans>,
				description: <Trans>Orchestrate any coding agent.</Trans>,
			},
			{
				href: `${COMPANY.DOCS_URL}/cli/getting-started`,
				label: "CLI",
				description: <Trans>Drive it from the terminal</Trans>,
				external: true,
			},
			{
				href: "/mobile",
				label: <Trans>Mobile</Trans>,
				description: <Trans>Run your agents from your phone.</Trans>,
			},
		],
	},
	{
		id: "features",
		title: <Trans>Features</Trans>,
		links: [
			{
				href: "/pages",
				label: <Trans>Pages</Trans>,
				description: (
					<Trans>Share agent work as a link your team can comment on.</Trans>
				),
			},
			{
				href: "/mcp-install",
				label: "MCP",
				description: <Trans>Connect any AI agent to Superset.</Trans>,
			},
			{
				href: "/marketplace",
				label: <Trans>Marketplace</Trans>,
				description: <Trans>Add themes and agents to Superset.</Trans>,
			},
			{
				href: "/cloud",
				label: <Trans>Cloud</Trans>,
				description: <Trans>Become a design partner.</Trans>,
				badge: <Trans>Coming soon</Trans>,
			},
		],
	},
];

export const PRODUCT_LINKS: NavLink[] = PRODUCT_SECTIONS.flatMap(
	(section) => section.links,
);

export interface NavFeatured {
	href: string;
	image: string;
	eyebrow: ReactNode;
	title: ReactNode;
	description: ReactNode;
	cta: ReactNode;
}

export const PRODUCT_FEATURED: NavFeatured = {
	href: "/pages",
	image: "/pages/hero-poster.webp",
	eyebrow: <Trans>New</Trans>,
	title: <Trans>Superset Pages</Trans>,
	description: (
		<Trans>Share agent work as a link your team can comment on.</Trans>
	),
	cta: <Trans>Explore Pages</Trans>,
};

export const RESOURCE_SECTIONS: NavSection[] = [
	{
		id: "learn",
		title: <Trans>Learn</Trans>,
		links: [
			{
				href: `${COMPANY.DOCS_URL}/first-workspace`,
				label: <Trans>Get started</Trans>,
				description: <Trans>Install and run your first agent.</Trans>,
				external: true,
			},
			{
				href: COMPANY.DOCS_URL,
				label: <Trans>Documentation</Trans>,
				description: <Trans>Guides, references, and integrations.</Trans>,
				external: true,
			},
			{
				href: COMPANY.YOUTUBE_URL,
				label: <Trans>Video tutorials</Trans>,
				description: <Trans>Watch walkthroughs on YouTube.</Trans>,
				external: true,
			},
			{
				href: "/parallel-coding-agents",
				label: <Trans>Parallel agents guide</Trans>,
				description: <Trans>Run agents side by side, then review.</Trans>,
			},
		],
	},
	{
		id: "updates",
		title: <Trans>Updates</Trans>,
		links: [
			{
				href: "/changelog",
				label: <Trans>Changelog</Trans>,
				description: <Trans>New releases and product updates.</Trans>,
			},
			{
				href: "/roadmap",
				label: <Trans>Roadmap</Trans>,
				description: <Trans>What we're building now and next.</Trans>,
			},
			{
				href: "/blog",
				label: <Trans>Blog</Trans>,
				description: <Trans>Engineering deep-dives and launches.</Trans>,
			},
		],
	},
	{
		id: "explore",
		title: <Trans>Explore</Trans>,
		links: [
			{
				href: "/compare",
				label: <Trans>Compare</Trans>,
				description: <Trans>How Superset compares to other tools.</Trans>,
			},
			{
				href: "/community",
				label: <Trans>Community</Trans>,
				description: <Trans>Discord, GitHub, and office hours.</Trans>,
			},
			{
				href: "/leaderboard",
				label: <Trans>Leaderboard</Trans>,
				description: <Trans>See how your agent usage compares.</Trans>,
			},
			{
				href: COMPANY.TRUST_URL,
				label: <Trans>Security</Trans>,
				description: <Trans>How we protect your code.</Trans>,
				external: true,
			},
		],
	},
];

export const RESOURCE_LINKS: NavLink[] = RESOURCE_SECTIONS.flatMap(
	(section) => section.links,
);

export const RESOURCE_FEATURED: NavFeatured = {
	href: "/blog/review-agent-work-with-pages",
	image: "/pages/demo-thumbnail.webp",
	eyebrow: <Trans>Guide</Trans>,
	title: <Trans>Review agent work with Pages</Trans>,
	description: (
		<Trans>Pin feedback to a page and let the agent make the change.</Trans>
	),
	cta: <Trans>Read the guide</Trans>,
};

export const TOP_LEVEL_LINKS: NavLink[] = [
	{
		href: "/pricing",
		label: <Trans>Pricing</Trans>,
	},
	{
		href: "/enterprise",
		label: <Trans>Enterprise</Trans>,
	},
	{
		href: "/careers",
		label: <Trans>Join us</Trans>,
	},
];
