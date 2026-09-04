export * from "./manifests.generated";

export const DEFAULT_MARKETPLACE = "superset";
export const DEFAULT_MARKETPLACE_REPO = "superset-sh/superset";
export const DEFAULT_MARKETPLACE_REF = "main";
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
	"Productivity",
	"Communication",
	"Developer tools",
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
	/** Names of skills the plugin bundles (Codex manifests point `skills` at a directory; a resolved entry lists them). */
	skills?: readonly string[];
	auth?: readonly {
		type: "oauth2" | "api_key";
		label?: string | null;
		inputs?: readonly {
			name: string;
			label?: string;
			placeholder?: string;
			required?: boolean;
			secret?: boolean;
		}[];
	}[];
	/** Curation attribute, not manifest vocabulary: surfaces in Featured. */
	featured?: boolean;
}

/**
 * An MCP server found in the user's agent configs that Superset didn't write
 * — any scope (Claude user/project, Codex, Cursor). Carries enough of the
 * config to match against catalog entries by more than name: people name
 * servers freely ("linear-server"), so identity comes from where the server
 * points, not what it's called.
 */
export interface ExternalMcpServer {
	name: string;
	url?: string;
	command?: string;
	args?: readonly string[];
	/** Where it was found, for display: "Claude Code (project)", "Codex", … */
	source?: string;
}

function urlHost(value: string): string | null {
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

/**
 * "npx -y @playwright/mcp@latest" → "@playwright/mcp". Only the first
 * non-flag arg names the package — scanning further would match subcommands
 * (e.g. a literal `mcp` arg) and create false matches against unrelated
 * servers.
 */
function packageFromArgs(args: readonly string[] | undefined): string | null {
	for (const arg of args ?? []) {
		if (arg.startsWith("-")) continue;
		const match = arg.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@[^@]*)?$/);
		return match?.[1] ?? null;
	}
	return null;
}

function externalMatchesConfig(
	server: ExternalMcpServer,
	catalogName: string,
	config: PluginMcpServerConfig,
): boolean {
	if (server.name === catalogName) return true;
	if ("url" in config && server.url) {
		const catalogHost = urlHost(config.url);
		if (catalogHost !== null && catalogHost === urlHost(server.url)) {
			return true;
		}
	}
	if ("command" in config) {
		const pkg = packageFromArgs(config.args);
		if (pkg !== null) {
			const haystack = [server.command ?? "", ...(server.args ?? [])].join(" ");
			if (haystack.includes(pkg)) return true;
		}
	}
	return false;
}

/**
 * Whether one catalog server is already covered by an entry the user wrote
 * themselves — matched by name, remote URL hostname, or the npm package a
 * stdio server runs (people name servers freely, e.g. "linear-server").
 * The materializer skips satisfied servers so installing never duplicates.
 */
export function isServerSatisfiedExternally(
	catalogName: string,
	config: PluginMcpServerConfig,
	external: readonly ExternalMcpServer[],
): boolean {
	return external.some((server) =>
		externalMatchesConfig(server, catalogName, config),
	);
}

/** The user's own config entries that correspond to this plugin. */
export function getMatchingExternalServers(
	plugin: PluginCatalogEntry,
	external: readonly ExternalMcpServer[],
): ExternalMcpServer[] {
	const entries = Object.entries(plugin.mcpServers);
	return external.filter((server) =>
		entries.some(([name, config]) =>
			externalMatchesConfig(server, name, config),
		),
	);
}

/** Whether the user already has any of this plugin's servers configured themselves. */
export function isPluginExternallyConfigured(
	plugin: PluginCatalogEntry,
	external: readonly ExternalMcpServer[],
): boolean {
	return getMatchingExternalServers(plugin, external).length > 0;
}

/** What a plugin puts on your machine, for at-a-glance labeling in the UI. */
export type PluginComponentKind = "mcp" | "cli" | "skills";

/**
 * Derived from the manifest so labels can't drift from behavior: a remote
 * `url` server is "mcp", a `command` server runs a local process ("cli"),
 * bundled skills are "skills".
 */
export function getPluginComponentKinds(
	plugin: PluginCatalogEntry,
): PluginComponentKind[] {
	const kinds = new Set<PluginComponentKind>();
	for (const config of Object.values(plugin.mcpServers)) {
		kinds.add("url" in config ? "mcp" : "cli");
	}
	if (plugin.skills && plugin.skills.length > 0) {
		kinds.add("skills");
	}
	return [...kinds];
}

/**
 * The managed skills the `superset` plugin provisions into every agent CLI
 * (see packages/agent-setup/src/managed-skills.ts). The Plugins page lists
 * these read-only on its Skills tab; they are not installable units in the
 * MVP.
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
	{
		name: "plugins",
		description:
			"Install plugins, connect their accounts, and call their MCP tools",
	},
	{ name: "setup", description: "Make a repository Superset-ready" },
	{ name: "standup", description: "Digest of what your Superset agents did" },
] as const;

export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
	{
		name: "superset",
		version: "1.0.0",
		description: "Manage Superset workspaces, tasks, and automations",
		interface: { displayName: "Superset", category: "Productivity" },
		mcpServers: {
			superset: { type: "http", url: "https://api.superset.sh/mcp" },
		},
		skills: SUPERSET_MANAGED_SKILLS.map((skill) => skill.name),
		featured: true,
	},
	{
		name: "linear",
		version: "1.0.0",
		description: "Plan and build products",
		interface: { displayName: "Linear", category: "Productivity" },
		auth: [{ type: "oauth2" }],
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
		auth: [{ type: "oauth2" }],
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
		interface: { displayName: "Sentry", category: "Developer tools" },
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
		name: "slack",
		version: "1.0.0",
		description: "Read and send messages in your workspace",
		interface: { displayName: "Slack", category: "Communication" },
		mcpServers: {
			slack: { type: "http", url: "https://mcp.slack.com/mcp" },
		},
	},
	{
		name: "vercel",
		version: "1.0.0",
		description: "Manage deployments, projects, and logs",
		interface: { displayName: "Vercel", category: "Developer tools" },
		mcpServers: {
			vercel: { type: "http", url: "https://mcp.vercel.com" },
		},
	},
	{
		name: "supabase",
		version: "1.0.0",
		description: "Manage your Supabase projects and data",
		interface: { displayName: "Supabase", category: "Data & APIs" },
		mcpServers: {
			supabase: { type: "http", url: "https://mcp.supabase.com/mcp" },
		},
	},
	{
		name: "posthog",
		version: "1.0.0",
		description: "Query analytics, insights, and feature flags",
		interface: { displayName: "PostHog", category: "Data & APIs" },
		mcpServers: {
			posthog: { type: "http", url: "https://mcp.posthog.com/mcp" },
		},
	},
	{
		name: "superhuman",
		version: "1.0.0",
		description: "Search and manage your email",
		interface: { displayName: "Superhuman", category: "Communication" },
		mcpServers: {
			superhuman: {
				type: "http",
				url: "https://mcp.mail.superhuman.com/mcp",
			},
		},
	},
	{
		name: "granola",
		version: "1.0.0",
		description: "Search and use your meeting notes",
		interface: { displayName: "Granola", category: "Productivity" },
		mcpServers: {
			granola: { type: "http", url: "https://mcp.granola.ai/mcp" },
		},
	},
	{
		name: "circleback",
		version: "1.0.0",
		description: "Meeting notes, action items, and transcripts",
		interface: { displayName: "Circleback", category: "Productivity" },
		mcpServers: {
			circleback: { type: "http", url: "https://circleback.ai/api/mcp" },
		},
	},
	{
		name: "monday",
		version: "1.0.0",
		description: "Manage boards, items, and workflows",
		interface: { displayName: "monday.com", category: "Productivity" },
		mcpServers: {
			monday: { type: "http", url: "https://mcp.monday.com/mcp" },
		},
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
	/**
	 * false = keep the install record but materialize nothing (Codex's
	 * `enabled = false` semantics). Absent means enabled — records written
	 * before this field existed stay active.
	 */
	enabled?: boolean;
}
