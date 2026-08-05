// Generated from the internal product roadmap (Notion → .github/prompts/update-roadmap.md).
// Only items marked Public in Notion appear here; descriptions are the public copy, not internal notes.
export type RoadmapCategory =
	| "Agents"
	| "Desktop"
	| "Platform"
	| "Mobile"
	| "Integrations";

export type RoadmapStatus = "now" | "next" | "later" | "shipped";

interface RoadmapItemBase {
	id: string;
	title: string;
	description: string;
	category: RoadmapCategory;
}

interface ActiveRoadmapItem extends RoadmapItemBase {
	status: "now" | "next" | "later";
}

interface ShippedRoadmapItem extends RoadmapItemBase {
	status: "shipped";
	shippedDate: string;
	/** Screenshot from the matching changelog entry, when one exists. */
	image?: string;
	/** Link to the changelog entry covering the ship. */
	href?: string;
	/** GitHub PR URL, for ships not (yet) covered by a changelog entry. */
	pr?: string;
}

export type RoadmapItem = ActiveRoadmapItem | ShippedRoadmapItem;

export const CATEGORIES: RoadmapCategory[] = [
	"Agents",
	"Desktop",
	"Platform",
	"Mobile",
	"Integrations",
];

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
	now: "In Progress",
	next: "Up Next",
	later: "Exploring",
	shipped: "Recently Shipped",
};

export const STATUS_DESCRIPTIONS: Record<RoadmapStatus, string> = {
	now: "Being built right now.",
	next: "Committed — starting soon.",
	later: "On our radar. Order and scope may change.",
	shipped: "Live in the app.",
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// ── Now ──────────────────────────────────────────
	{
		id: "in-app-pr-merge",
		title: "In-app PR merge",
		description:
			"Merge pull requests without leaving Superset, plus a round of chat fixes and polish.",
		category: "Desktop",
		status: "now",
	},
	{
		id: "mcp-manager",
		title: "MCP manager",
		description:
			"Install, authorize, and scope MCP servers across all your workspaces from one place, with centralized OAuth.",
		category: "Integrations",
		status: "now",
	},
	{
		id: "embedded-browser",
		title: "Embedded browser improvements",
		description:
			"A better in-app browser: preview your changes and click any element to send it to the agent as context.",
		category: "Desktop",
		status: "now",
	},
	{
		id: "onboarding",
		title: "Smoother onboarding",
		description:
			"A faster path from install to your first agent run, with a guided first workspace.",
		category: "Desktop",
		status: "now",
	},

	// ── Next ─────────────────────────────────────────
	{
		id: "chat-v3",
		title: "Next-generation chat",
		description:
			"A rebuilt chat surface for driving agents — richer tool output, smoother steering, faster everything.",
		category: "Agents",
		status: "next",
	},
	{
		id: "native-pr-reviews",
		title: "Native PR reviews",
		description:
			"Review pull requests inside Superset — diff pane, agent-assisted review, act on comments directly.",
		category: "Desktop",
		status: "next",
	},
	{
		id: "improved-diff-viewer",
		title: "Improved diff viewer",
		description:
			"A faster, clearer diff experience for reviewing what your agents changed.",
		category: "Desktop",
		status: "next",
	},
	{
		id: "chat-background-processes",
		title: "Background processes in chat",
		description:
			"Agents can watch CI checks, tail dev servers, and keep long-running processes alive while they work.",
		category: "Agents",
		status: "next",
	},
	{
		id: "plugin-marketplace",
		title: "Plugin marketplace",
		description:
			"Browse and install skills, MCP servers, and agent configs shared by the community.",
		category: "Integrations",
		status: "next",
	},
	{
		id: "sso-saml",
		title: "SSO (SAML / OIDC)",
		description: "Single sign-on for organizations, self-serve configurable.",
		category: "Platform",
		status: "next",
	},

	// ── Later ────────────────────────────────────────
	{
		id: "project-wide-search",
		title: "Project-wide search",
		description:
			"Search across file contents and across all your workspaces at once.",
		category: "Desktop",
		status: "later",
	},
	{
		id: "work-from-tickets",
		title: "Work from tickets",
		description:
			"Start a workspace straight from a Linear ticket — the agent picks it up and reports back with a PR.",
		category: "Integrations",
		status: "later",
	},
	{
		id: "autonomous-ticket-to-pr",
		title: "Autonomous ticket-to-PR pipeline",
		description:
			"File a ticket, get back a verified, merge-ready PR — with screenshots or a screencast as proof the change works.",
		category: "Agents",
		status: "later",
	},
	{
		id: "automations",
		title: "Automations & event triggers",
		description:
			"Scheduled and event-triggered agents — cron, GitHub events, webhooks — with ready-made templates.",
		category: "Agents",
		status: "later",
	},
	{
		id: "orchestration-chat",
		title: "Orchestration chat",
		description:
			"One chat that plans a task, fans out parallel agents across worktrees, and brings the results back together.",
		category: "Agents",
		status: "later",
	},
	{
		id: "self-verification",
		title: "Agent self-verification",
		description:
			"Agents load their own preview, drive the UI, and attach screenshot proof before marking work ready for review.",
		category: "Agents",
		status: "later",
	},
	{
		id: "session-snapshots",
		title: "Session snapshots & revert",
		description:
			"Roll back an agent session to any checkpoint — conversation and file changes together.",
		category: "Desktop",
		status: "later",
	},
	{
		id: "attention-queue",
		title: "Attention queue",
		description:
			"Always know which agent needs you, with notifications that deep-link straight to the blocked agent.",
		category: "Desktop",
		status: "later",
	},
	{
		id: "cloud-sandboxes",
		title: "Cloud sandboxes",
		description:
			"Machine-unbound cloud workspaces that spin up in seconds and can be shared with teammates.",
		category: "Platform",
		status: "later",
	},
	{
		id: "sdk-api",
		title: "SDK & public API",
		description:
			"Drive workspaces, agents, and sessions programmatically from scripts, CI, or your own tools.",
		category: "Platform",
		status: "later",
	},
	{
		id: "ios-app",
		title: "iOS app",
		description: "Monitor, steer, and unblock your agents from your phone.",
		category: "Mobile",
		status: "later",
	},

	// ── Shipped ──────────────────────────────────────
	{
		id: "offline-local-first",
		title: "Offline / local-first mode",
		description:
			"The full core loop — import a repo, run an agent, review the diff — now works signed out and offline.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		pr: "https://github.com/superset-sh/superset/pull/5731",
	},
	{
		id: "workspace-pinning-bulk-actions",
		title: "Workspace pinning & bulk actions",
		description:
			"Pin workspaces above your projects, then ⌘-click a batch to move, group, or delete them all at once.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-workspace-bulk-select.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "sidebar-redesign",
		title: "Cleaner, denser sidebar",
		description:
			"A full restyle — denser rows, port and agent chips under each workspace, one-click stop for everything.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-sidebar-redesign.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "grok-kimi-agents",
		title: "Grok & Kimi Code agents",
		description:
			"Grok and Kimi Code join the lineup alongside Claude Code, Codex, and friends.",
		category: "Agents",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-add-agent-picker.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "stability-pass",
		title: "Stability improvements",
		description:
			"A focused burn-down of crashes, hangs, and reconnect failures across the app.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
	},
	{
		id: "performance-pass",
		title: "Lighter memory, smoother under load",
		description:
			"Lower memory with many terminals open, smoother git in big repos, and less background CPU.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Jul 2026",
		image: "/changelog/2026-07-19-performance-summary.png",
		href: "/changelog/2026-07-19-performance-memory-and-load",
	},
	{
		id: "terminal-rich-input",
		title: "Rich input for the terminal",
		description:
			"Press ⌘I over any terminal and compose in a real editor — multiline prompts and @file mentions.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Jul 2026",
		image: "/changelog/2026-07-12-rich-input-hero.png",
		href: "/changelog/2026-07-12-terminal-rich-input-mistral-vibe",
	},
	{
		id: "custom-terminal-agents",
		title: "Custom terminal agents",
		description:
			"Register any CLI agent alongside the built-ins, each with its own name, icon, and launch command.",
		category: "Agents",
		status: "shipped",
		shippedDate: "Jul 2026",
		href: "/changelog/2026-07-06-custom-agents-workspace-activity-fable",
	},
];
