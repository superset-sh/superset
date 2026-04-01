export type RoadmapCategory = "Desktop" | "Web" | "Mobile" | "Integrations";

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
}

export type RoadmapItem = ActiveRoadmapItem | ShippedRoadmapItem;

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
		title: "Mobile companion app",
		description:
			"Monitor and manage running agents from your phone. Approve prompts on the go.",
		category: "Mobile",
		status: "now",
	},
	{
		id: "now-2",
		title: "Cloud workspaces",
		description:
			"Run agents in the cloud with persistent workspaces — no local machine required.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-3",
		title: "Team workspaces",
		description:
			"Shared workspaces with role-based access so teams can collaborate on agent tasks.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-4",
		title: "Session restore & persistence",
		description:
			"Automatically resume agent sessions after app restart or crash recovery.",
		category: "Desktop",
		status: "now",
	},

	// ── Next ─────────────────────────────────────────
	{
		id: "next-1",
		title: "VS Code extension",
		description:
			"Launch and manage Superset agents directly from the VS Code sidebar.",
		category: "Integrations",
		status: "next",
	},
	{
		id: "next-2",
		title: "Agent-to-agent communication",
		description:
			"Allow agents to delegate subtasks to other agents and share context.",
		category: "Desktop",
		status: "next",
	},
	{
		id: "next-3",
		title: "Usage analytics dashboard",
		description:
			"Track token usage, agent runtime, and cost breakdowns per workspace.",
		category: "Web",
		status: "next",
	},
	{
		id: "next-4",
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
		title: "Review tab & PR comments",
		description:
			"Review tab in changes sidebar for PR review comments with inline actions.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-2",
		title: "Configurable agent settings",
		description:
			"Override presets and preview agent configuration templates directly from the UI.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-3",
		title: "CodeMirror editor",
		description:
			"Replaced Monaco with CodeMirror — 150KB vs 5MB, significantly faster loading.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-4",
		title: "Cross-workspace search",
		description:
			"Search across all open workspaces simultaneously with unified results.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-5",
		title: "Chat view GA",
		description:
			"Chat view generally available with refreshed tool call visuals and rich UI cards.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Mar 2026",
	},
	{
		id: "shipped-6",
		title: "Multi-provider model picker",
		description:
			"Copilot, Cursor Agent, and Gemini support alongside Claude and GPT models.",
		category: "Integrations",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-7",
		title: "In-app browser",
		description:
			"Chrome-like browser with URL autocomplete, DevTools support, and desktop automation tools.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-8",
		title: "File explorer",
		description:
			"Hierarchical tree view with file operations, material icon theme, and drag-and-drop.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-9",
		title: "Linux desktop support",
		description: "Native Linux desktop application distributed as AppImage.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "Feb 2026",
	},
	{
		id: "shipped-10",
		title: "Electric SQL sync",
		description:
			"Local-first task synchronization with Electric SQL and Linear integration via webhooks.",
		category: "Integrations",
		status: "shipped",
		shippedDate: "Dec 2025",
	},
];
