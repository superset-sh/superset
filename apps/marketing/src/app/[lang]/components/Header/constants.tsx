import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { ReactNode } from "react";

export interface NavLink {
	href: string;
	label: ReactNode;
	description?: ReactNode;
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
				description: <Trans>Run any coding agent</Trans>,
			},
			{
				href: `${COMPANY.DOCS_URL}/cli/getting-started`,
				label: "CLI",
				description: <Trans>In your terminal</Trans>,
				external: true,
			},
			{
				href: "/mobile",
				label: <Trans>Mobile</Trans>,
				description: <Trans>Agents on your phone</Trans>,
			},
			{
				href: "/mcp-install",
				label: "MCP",
				description: <Trans>Connect any agent</Trans>,
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
				description: <Trans>Review agent work</Trans>,
			},
			{
				href: "/automations",
				label: <Trans>Automations</Trans>,
				description: <Trans>Agents on a schedule</Trans>,
			},
			{
				href: "/browser",
				label: <Trans>Browser</Trans>,
				description: <Trans>Agent-driven previews</Trans>,
			},
			{
				href: "/marketplace",
				label: <Trans>Marketplace</Trans>,
				description: <Trans>Themes and agents</Trans>,
			},
		],
	},
	{
		id: "coming-soon",
		title: <Trans>Coming soon</Trans>,
		links: [
			{
				href: "/plugins",
				label: <Trans>Plugins</Trans>,
				description: <Trans>Connect agents to your apps</Trans>,
			},
			{
				href: "/cloud",
				label: <Trans>Cloud</Trans>,
				description: <Trans>Join as a design partner</Trans>,
			},
		],
	},
];

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
		<Trans>
			Your agent publishes designs and reports. Your team comments, and it gets
			to work.
		</Trans>
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
				description: <Trans>Your first agent</Trans>,
				external: true,
			},
			{
				href: COMPANY.DOCS_URL,
				label: <Trans>Documentation</Trans>,
				description: <Trans>Guides and references</Trans>,
				external: true,
			},
			{
				href: COMPANY.YOUTUBE_URL,
				label: <Trans>Video tutorials</Trans>,
				description: <Trans>Short walkthroughs</Trans>,
				external: true,
			},
			{
				href: "/parallel-coding-agents",
				label: <Trans>Parallel agents</Trans>,
				description: <Trans>Run agents side by side</Trans>,
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
				description: <Trans>What shipped</Trans>,
			},
			{
				href: "/roadmap",
				label: <Trans>Roadmap</Trans>,
				description: <Trans>What's next</Trans>,
			},
			{
				href: "/blog",
				label: <Trans>Blog</Trans>,
				description: <Trans>News and deep dives</Trans>,
			},
			{
				href: COMPANY.STATUS_URL,
				label: <Trans>Status</Trans>,
				description: <Trans>Uptime and incidents</Trans>,
				external: true,
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
				description: <Trans>Superset next to others</Trans>,
			},
			{
				href: "/community",
				label: <Trans>Community</Trans>,
				description: <Trans>Discord and GitHub</Trans>,
			},
			{
				href: "/leaderboard",
				label: <Trans>Leaderboard</Trans>,
				description: <Trans>Agent usage rankings</Trans>,
			},
			{
				href: COMPANY.TRUST_URL,
				label: <Trans>Security</Trans>,
				description: <Trans>How we protect code</Trans>,
				external: true,
			},
		],
	},
];

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
