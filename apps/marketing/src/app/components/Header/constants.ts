import { COMPANY } from "@superset/shared/constants";

export interface NavLink {
	href: string;
	label: string;
	description?: string;
	external?: boolean;
}

export const PRODUCT_LINKS: NavLink[] = [
	{
		href: "/",
		label: "Overview",
		description: "Orchestrate any coding agent.",
	},
	{
		href: "/changelog",
		label: "Changelog",
		description: "New releases and product updates.",
	},
	{
		href: "/roadmap",
		label: "Roadmap",
		description: "What we're building now and next.",
	},
	{
		href: "/mcp-install",
		label: "MCP",
		description: "Connect any AI agent to Superset.",
	},
];

export const RESOURCE_LINKS: NavLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: "Documentation",
		description: "Guides, references, and integrations.",
		external: true,
	},
	{
		href: "/blog",
		label: "Blog",
		description: "Engineering deep-dives and launches.",
	},
	{
		href: "/community",
		label: "Community",
		description: "Discord, GitHub, and office hours.",
	},
	{
		href: "/team",
		label: "About",
		description: "The people behind Superset.",
	},
];

export const TOP_LEVEL_LINKS: NavLink[] = [
	{ href: "/pricing", label: "Pricing" },
	{ href: "/enterprise", label: "Enterprise" },
	{ href: "/join-us", label: "Join us" },
];
