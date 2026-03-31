export type RoadmapCategory = "Desktop" | "Web" | "Mobile" | "Integrations";

export type RoadmapStatus = "now" | "next" | "later" | "shipped";

export interface RoadmapItem {
	id: string;
	title: string;
	description: string;
	category: RoadmapCategory;
	status: RoadmapStatus;
	shippedDate?: string;
}

export const CATEGORIES: RoadmapCategory[] = [
	"Desktop",
	"Web",
	"Mobile",
	"Integrations",
];

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
	now: "In Progress",
	next: "Up Next",
	later: "Exploring",
	shipped: "Recently Shipped",
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// ── Now ──────────────────────────────────────────
	{
		id: "now-1",
		title: "Session restore & persistence",
		description:
			"Automatically resume agent sessions after app restart or crash recovery.",
		category: "Desktop",
		status: "now",
	},
	{
		id: "now-2",
		title: "Team workspaces",
		description:
			"Shared workspaces with role-based access so teams can collaborate on agent tasks.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-3",
		title: "Streaming API responses",
		description:
			"Real-time streaming for agent output via the API, replacing polling.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-4",
		title: "Custom agent templates",
		description:
			"Create and share reusable agent configurations with pre-defined prompts and tools.",
		category: "Desktop",
		status: "now",
	},
	{
		id: "now-5",
		title: "Git worktree improvements",
		description:
			"Better worktree lifecycle management with automatic cleanup and status indicators.",
		category: "Desktop",
		status: "now",
	},

	// ── Next ─────────────────────────────────────────
	{
		id: "next-1",
		title: "Mobile companion app",
		description:
			"Monitor and manage running agents from your phone. Approve prompts on the go.",
		category: "Mobile",
		status: "next",
	},
	{
		id: "next-2",
		title: "VS Code extension",
		description:
			"Launch and manage Superset agents directly from the VS Code sidebar.",
		category: "Integrations",
		status: "next",
	},
	{
		id: "next-3",
		title: "Agent-to-agent communication",
		description:
			"Allow agents to delegate subtasks to other agents and share context.",
		category: "Desktop",
		status: "next",
	},
	{
		id: "next-4",
		title: "Usage analytics dashboard",
		description:
			"Track token usage, agent runtime, and cost breakdowns per workspace.",
		category: "Web",
		status: "next",
	},
	{
		id: "next-5",
		title: "Webhook integrations",
		description:
			"Trigger agents from external events via webhooks — CI pipelines, GitHub, Slack.",
		category: "Integrations",
		status: "next",
	},

	// ── Later ────────────────────────────────────────
	{
		id: "later-1",
		title: "Self-hosted deployment",
		description:
			"Run Superset on your own infrastructure with a single Docker Compose file.",
		category: "Web",
		status: "later",
	},
	{
		id: "later-2",
		title: "Agent marketplace",
		description:
			"Browse, install, and publish community-built agent templates and tools.",
		category: "Web",
		status: "later",
	},
	{
		id: "later-3",
		title: "Multi-repo orchestration",
		description:
			"Run coordinated agent tasks across multiple repositories simultaneously.",
		category: "Desktop",
		status: "later",
	},
	{
		id: "later-4",
		title: "JetBrains plugin",
		description:
			"Full Superset integration for IntelliJ, WebStorm, and other JetBrains IDEs.",
		category: "Integrations",
		status: "later",
	},

	// ── Shipped ──────────────────────────────────────
	{
		id: "shipped-1",
		title: "Parallel agent execution",
		description:
			"Run 10+ coding agents simultaneously on your local machine with git worktrees.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-2",
		title: "MCP server support",
		description:
			"Connect agents to external tools and data sources via the Model Context Protocol.",
		category: "Integrations",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-3",
		title: "Task queue & scheduling",
		description:
			"Queue up agent tasks and schedule them to run at specific times.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-4",
		title: "Public API v1",
		description:
			"RESTful API for managing agents, tasks, and workspaces programmatically.",
		category: "Web",
		status: "shipped",
		shippedDate: "Jan 2026",
	},
	{
		id: "shipped-5",
		title: "Dark mode & theming",
		description:
			"Full dark mode support with customizable accent colors for the web dashboard.",
		category: "Web",
		status: "shipped",
		shippedDate: "Jan 2026",
	},
];
