import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { ReactNode } from "react";

export interface NavLink {
	href: string;
	label: ReactNode;
	description?: ReactNode;
	external?: boolean;
}

export const PRODUCT_LINKS: NavLink[] = [
	{
		href: "/",
		label: <Trans>Overview</Trans>,
		description: <Trans>Orchestrate any coding agent.</Trans>,
	},
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
		href: "/mcp-install",
		label: "MCP",
		description: <Trans>Connect any AI agent to Superset.</Trans>,
	},
];

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
		href: "/join-us",
		label: <Trans>Join us</Trans>,
	},
];
