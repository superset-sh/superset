/**
 * The curated plugin catalog the desktop Plugins page renders and installs
 * from. Static for the MVP — each entry is shaped as a pre-resolved plugin
 * manifest using the Codex plugin vocabulary
 * (developers.openai.com/plugins/build/plugins: `name`, `version`,
 * `description`, `interface`, and an `.mcp.json`-shaped `mcpServers` map), so
 * when the catalog grows real sources (git/npm/tarball) entries port
 * field-for-field instead of needing a data migration.
 *
 * Icons stay per-app (`packages/shared` isn't React-aware) — same split as
 * `INTEGRATIONS` in ../integrations.ts.
 */

/**
 * One MCP server a plugin materializes into agent configs. Same shape as a
 * Codex/Claude `.mcp.json` value: remote servers carry `url` (+ transport
 * `type`), local ones `command`/`args`/`env`. Server auth happens in the
 * agent CLI on first use (Codex calls this ON_FIRST_USE) — org
 * integration_connections tokens are a separate plane and never ship here.
 */
export type PluginMcpServerConfig =
	| {
			type: "http" | "sse";
			url: string;
			headers?: Record<string, string>;
	  }
	| {
			command: string;
			args?: readonly string[];
			env?: Record<string, string>;
	  };

export const PLUGIN_CATEGORIES = [
	"Project management",
	"Productivity",
	"Developer tools",
	"Monitoring",
	"Design",
	"Data & APIs",
] as const;

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

export interface PluginCatalogEntry {
	/**
	 * Stable kebab-case id — the key installs, the materialization ledger, and
	 * analytics all hang off. Where a `integration_provider` slug exists for
	 * the same product (linear, github, notion, sentry) the id matches it, so
	 * a future join against `integration_connections` is free.
	 */
	name: string;
	/** Semver; bumping forces re-materialization (Codex convention). */
	version: string;
	description: string;
	interface: {
		displayName: string;
		category: PluginCategory;
	};
	/**
	 * Server-name → config. Names land verbatim as config keys in agent CLIs
	 * (`mcp__<name>__<tool>` namespacing comes from the CLI itself); ownership
	 * is tracked by the materialization ledger, not the name.
	 */
	mcpServers: Record<string, PluginMcpServerConfig>;
	/** Curation attribute, not manifest vocabulary: surfaces in Featured. */
	featured?: boolean;
}

export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
	{
		name: "superset",
		version: "1.0.0",
		description: "Manage Superset workspaces, tasks, and automations",
		interface: { displayName: "Superset", category: "Productivity" },
		mcpServers: {
			superset: { type: "http", url: "https://api.superset.sh/mcp" },
		},
		featured: true,
	},
	{
		name: "linear",
		version: "1.0.0",
		description: "Plan and build products",
		interface: { displayName: "Linear", category: "Project management" },
		mcpServers: {
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		},
		featured: true,
	},
	{
		name: "github",
		version: "1.0.0",
		description: "Work with issues, pull requests, and repos",
		interface: { displayName: "GitHub", category: "Developer tools" },
		mcpServers: {
			github: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
		},
		featured: true,
	},
	{
		name: "notion",
		version: "1.0.0",
		description: "Notion workflows for specs, research, and docs",
		interface: { displayName: "Notion", category: "Productivity" },
		mcpServers: {
			notion: { type: "http", url: "https://mcp.notion.com/mcp" },
		},
		featured: true,
	},
	{
		name: "sentry",
		version: "1.0.0",
		description: "Debug with production error context",
		interface: { displayName: "Sentry", category: "Monitoring" },
		mcpServers: {
			sentry: { type: "http", url: "https://mcp.sentry.dev/mcp" },
		},
		featured: true,
	},
	{
		name: "figma",
		version: "1.0.0",
		description: "Bring designs into your workflow",
		interface: { displayName: "Figma", category: "Design" },
		mcpServers: {
			figma: { type: "http", url: "https://mcp.figma.com/mcp" },
		},
	},
	{
		name: "stripe",
		version: "1.0.0",
		description: "Query payments data and Stripe docs",
		interface: { displayName: "Stripe", category: "Data & APIs" },
		mcpServers: {
			stripe: { type: "http", url: "https://mcp.stripe.com" },
		},
	},
	{
		name: "neon",
		version: "1.0.0",
		description: "Manage Postgres branches and run queries",
		interface: { displayName: "Neon", category: "Data & APIs" },
		mcpServers: {
			neon: { type: "http", url: "https://mcp.neon.tech/mcp" },
		},
	},
	{
		name: "context7",
		version: "1.0.0",
		description: "Up-to-date docs for any library",
		interface: { displayName: "Context7", category: "Developer tools" },
		mcpServers: {
			context7: { type: "http", url: "https://mcp.context7.com/mcp" },
		},
	},
	{
		name: "playwright",
		version: "1.0.0",
		description: "Drive and test a real browser",
		interface: { displayName: "Playwright", category: "Developer tools" },
		mcpServers: {
			playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
		},
		featured: true,
	},
	{
		name: "chrome-devtools",
		version: "1.0.0",
		description: "Inspect and debug pages with Chrome DevTools",
		interface: {
			displayName: "Chrome DevTools",
			category: "Developer tools",
		},
		mcpServers: {
			"chrome-devtools": {
				command: "npx",
				args: ["-y", "chrome-devtools-mcp@latest"],
			},
		},
	},
];

export function getPluginByName(name: string): PluginCatalogEntry | undefined {
	return PLUGIN_CATALOG.find((plugin) => plugin.name === name);
}

/**
 * One install record, persisted as a JSON array on the local-db settings
 * singleton (mirrors `disabledAgentHooks`). Read by the main process at boot
 * to converge agent configs on the installed set.
 */
export interface InstalledPlugin {
	name: string;
	version: string;
	installedAt: string;
}

/**
 * The managed skills the `superset` plugin already provisions into every
 * agent CLI (see packages/agent-setup/src/managed-skills.ts). The Plugins
 * page lists these read-only on its Skills tab; they are not installable
 * units in the MVP.
 */
export const SUPERSET_MANAGED_SKILLS = [
	{
		name: "10x",
		description: "Personalized audit of Superset features you're not using yet",
	},
	{
		name: "automate",
		description: "Turn a recurring chore into a Superset automation",
	},
	{
		name: "browser",
		description: "Drive web pages from the in-app browser panes",
	},
	{
		name: "computer",
		description: "Drive native desktop apps and system browsers",
	},
	{
		name: "contribute",
		description: "Set up an open-source contribution to Superset",
	},
	{ name: "doctor", description: "Diagnose and fix Superset problems" },
	{ name: "feedback", description: "Report bugs and request features" },
	{
		name: "orchestrate",
		description: "Coordinate multiple coding agents across workspaces",
	},
	{ name: "setup", description: "Make a repository Superset-ready" },
	{ name: "standup", description: "Digest of what your Superset agents did" },
] as const;
