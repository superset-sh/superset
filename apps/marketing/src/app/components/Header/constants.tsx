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
		label: <Trans id="marketing.nav.product.overview.label">Overview</Trans>,
		description: (
			<Trans id="marketing.nav.product.overview.description">
				Orchestrate any coding agent.
			</Trans>
		),
	},
	{
		href: "/changelog",
		label: <Trans id="marketing.nav.product.changelog.label">Changelog</Trans>,
		description: (
			<Trans id="marketing.nav.product.changelog.description">
				New releases and product updates.
			</Trans>
		),
	},
	{
		href: "/roadmap",
		label: <Trans id="marketing.nav.product.roadmap.label">Roadmap</Trans>,
		description: (
			<Trans id="marketing.nav.product.roadmap.description">
				What we're building now and next.
			</Trans>
		),
	},
	{
		href: "/mcp-install",
		label: "MCP",
		description: (
			<Trans id="marketing.nav.product.mcp.description">
				Connect any AI agent to Superset.
			</Trans>
		),
	},
];

export const RESOURCE_LINKS: NavLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: <Trans id="marketing.nav.resources.docs.label">Documentation</Trans>,
		description: (
			<Trans id="marketing.nav.resources.docs.description">
				Guides, references, and integrations.
			</Trans>
		),
		external: true,
	},
	{
		href: "/blog",
		label: <Trans id="marketing.nav.resources.blog.label">Blog</Trans>,
		description: (
			<Trans id="marketing.nav.resources.blog.description">
				Engineering deep-dives and launches.
			</Trans>
		),
	},
	{
		href: "/community",
		label: (
			<Trans id="marketing.nav.resources.community.label">Community</Trans>
		),
		description: (
			<Trans id="marketing.nav.resources.community.description">
				Discord, GitHub, and office hours.
			</Trans>
		),
	},
	{
		href: "/team",
		label: <Trans id="marketing.nav.resources.about.label">About</Trans>,
		description: (
			<Trans id="marketing.nav.resources.about.description">
				The people behind Superset.
			</Trans>
		),
	},
];

export const TOP_LEVEL_LINKS: NavLink[] = [
	{
		href: "/pricing",
		label: <Trans id="marketing.nav.pricing">Pricing</Trans>,
	},
	{
		href: "/enterprise",
		label: <Trans id="marketing.nav.enterprise">Enterprise</Trans>,
	},
	{
		href: "/join-us",
		label: <Trans id="marketing.nav.joinUs">Join us</Trans>,
	},
];
