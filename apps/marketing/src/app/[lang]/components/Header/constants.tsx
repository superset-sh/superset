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
				description: <Trans>Themes and agents for Superset.</Trans>,
			},
			{
				href: "/cloud",
				label: <Trans>Cloud</Trans>,
				description: <Trans>Become a design partner.</Trans>,
				badge: <Trans>Coming soon</Trans>,
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
				href: "/leaderboard",
				label: <Trans>Leaderboard</Trans>,
				description: <Trans>See how your agent usage compares.</Trans>,
			},
		],
	},
];

export const PRODUCT_LINKS: NavLink[] = PRODUCT_SECTIONS.flatMap(
	(section) => section.links,
);

export const PRODUCT_FEATURED = {
	href: "/pages",
	image: "/pages/hero-poster.webp",
	eyebrow: <Trans>New</Trans>,
	title: <Trans>Superset Pages</Trans>,
	description: (
		<Trans>Share agent work as a link your team can comment on.</Trans>
	),
	cta: <Trans>Explore Pages</Trans>,
};

export const RESOURCE_LINKS: NavLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: <Trans>Documentation</Trans>,
		description: <Trans>Guides, references, and integrations.</Trans>,
		external: true,
	},
	{
		href: "/blog",
		label: <Trans>Blog</Trans>,
		description: <Trans>Engineering deep-dives and launches.</Trans>,
	},
	{
		href: "/community",
		label: <Trans>Community</Trans>,
		description: <Trans>Discord, GitHub, and office hours.</Trans>,
	},
	{
		href: "/team",
		label: <Trans>About</Trans>,
		description: <Trans>The people behind Superset.</Trans>,
	},
	{
		href: "/media",
		label: <Trans>Media kit</Trans>,
		description: <Trans>Logos, product images, and press contact.</Trans>,
	},
];

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
