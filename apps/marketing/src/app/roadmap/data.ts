// Generated from the internal product roadmap (Notion → .github/prompts/update-roadmap.md).
// Only items marked Public in Notion appear here; descriptions are the public copy, not internal notes.
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type RoadmapCategory =
	| "Agents"
	| "Desktop"
	| "Platform"
	| "Mobile"
	| "Integrations";

export type RoadmapStatus = "now" | "next" | "later" | "shipped";

interface RoadmapItemBase {
	id: string;
	title: MessageDescriptor;
	description: MessageDescriptor;
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

export const CATEGORY_LABELS: Record<RoadmapCategory, MessageDescriptor> = {
	Agents: msg({ id: "marketing.roadmap.category.agents", message: "Agents" }),
	Desktop: msg({
		id: "marketing.roadmap.category.desktop",
		message: "Desktop",
	}),
	Platform: msg({
		id: "marketing.roadmap.category.platform",
		message: "Platform",
	}),
	Mobile: msg({ id: "marketing.roadmap.category.mobile", message: "Mobile" }),
	Integrations: msg({
		id: "marketing.roadmap.category.integrations",
		message: "Integrations",
	}),
};

export const STATUS_LABELS: Record<RoadmapStatus, MessageDescriptor> = {
	now: msg({ id: "marketing.roadmap.status.now", message: "In Progress" }),
	next: msg({ id: "marketing.roadmap.status.next", message: "Up Next" }),
	later: msg({ id: "marketing.roadmap.status.later", message: "Exploring" }),
	shipped: msg({
		id: "marketing.roadmap.status.shipped",
		message: "Recently Shipped",
	}),
};

export const STATUS_DESCRIPTIONS: Record<RoadmapStatus, MessageDescriptor> = {
	now: msg({
		id: "marketing.roadmap.statusDescription.now",
		message: "Being built right now.",
	}),
	next: msg({
		id: "marketing.roadmap.statusDescription.next",
		message: "Committed, starting soon.",
	}),
	later: msg({
		id: "marketing.roadmap.statusDescription.later",
		message: "On our radar. Order and scope may change.",
	}),
	shipped: msg({
		id: "marketing.roadmap.statusDescription.shipped",
		message: "Live in the app.",
	}),
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// ── Now ──────────────────────────────────────────
	{
		id: "in-app-pr-merge",
		title: msg({
			id: "marketing.roadmap.item.inAppPrMerge.title",
			message: "In-app PR merge",
		}),
		description: msg({
			id: "marketing.roadmap.item.inAppPrMerge.description",
			message:
				"Merge pull requests without leaving Superset, plus a round of chat fixes and polish.",
		}),
		category: "Desktop",
		status: "now",
	},
	{
		id: "mcp-manager",
		title: msg({
			id: "marketing.roadmap.item.mcpManager.title",
			message: "MCP manager",
		}),
		description: msg({
			id: "marketing.roadmap.item.mcpManager.description",
			message:
				"Install, authorize, and scope MCP servers across all your workspaces from one place, with centralized OAuth.",
		}),
		category: "Integrations",
		status: "now",
	},
	{
		id: "embedded-browser",
		title: msg({
			id: "marketing.roadmap.item.embeddedBrowser.title",
			message: "Embedded browser improvements",
		}),
		description: msg({
			id: "marketing.roadmap.item.embeddedBrowser.description",
			message:
				"A better in-app browser: preview your changes and click any element to send it to the agent as context.",
		}),
		category: "Desktop",
		status: "now",
	},
	{
		id: "onboarding",
		title: msg({
			id: "marketing.roadmap.item.onboarding.title",
			message: "Smoother onboarding",
		}),
		description: msg({
			id: "marketing.roadmap.item.onboarding.description",
			message:
				"A faster path from install to your first agent run, with a guided first workspace.",
		}),
		category: "Desktop",
		status: "now",
	},

	// ── Next ─────────────────────────────────────────
	{
		id: "chat-v3",
		title: msg({
			id: "marketing.roadmap.item.chatV3.title",
			message: "Next-generation chat",
		}),
		description: msg({
			id: "marketing.roadmap.item.chatV3.description",
			message:
				"A rebuilt chat surface for driving agents: richer tool output, smoother steering, faster everything.",
		}),
		category: "Agents",
		status: "next",
	},
	{
		id: "native-pr-reviews",
		title: msg({
			id: "marketing.roadmap.item.nativePrReviews.title",
			message: "Native PR reviews",
		}),
		description: msg({
			id: "marketing.roadmap.item.nativePrReviews.description",
			message:
				"Review pull requests inside Superset: diff pane, agent-assisted review, act on comments directly.",
		}),
		category: "Desktop",
		status: "next",
	},
	{
		id: "improved-diff-viewer",
		title: msg({
			id: "marketing.roadmap.item.improvedDiffViewer.title",
			message: "Improved diff viewer",
		}),
		description: msg({
			id: "marketing.roadmap.item.improvedDiffViewer.description",
			message:
				"A faster, clearer diff experience for reviewing what your agents changed.",
		}),
		category: "Desktop",
		status: "next",
	},
	{
		id: "chat-background-processes",
		title: msg({
			id: "marketing.roadmap.item.chatBackgroundProcesses.title",
			message: "Background processes in chat",
		}),
		description: msg({
			id: "marketing.roadmap.item.chatBackgroundProcesses.description",
			message:
				"Agents can watch CI checks, tail dev servers, and keep long-running processes alive while they work.",
		}),
		category: "Agents",
		status: "next",
	},
	{
		id: "plugin-marketplace",
		title: msg({
			id: "marketing.roadmap.item.pluginMarketplace.title",
			message: "Plugin marketplace",
		}),
		description: msg({
			id: "marketing.roadmap.item.pluginMarketplace.description",
			message:
				"Browse and install skills, MCP servers, and agent configs shared by the community.",
		}),
		category: "Integrations",
		status: "next",
	},
	// ── Later ────────────────────────────────────────
	{
		id: "project-wide-search",
		title: msg({
			id: "marketing.roadmap.item.projectWideSearch.title",
			message: "Project-wide search",
		}),
		description: msg({
			id: "marketing.roadmap.item.projectWideSearch.description",
			message:
				"Search across file contents and across all your workspaces at once.",
		}),
		category: "Desktop",
		status: "later",
	},
	{
		id: "work-from-tickets",
		title: msg({
			id: "marketing.roadmap.item.workFromTickets.title",
			message: "Work from tickets",
		}),
		description: msg({
			id: "marketing.roadmap.item.workFromTickets.description",
			message:
				"Start a workspace straight from a Linear ticket. The agent picks it up and reports back with a PR.",
		}),
		category: "Integrations",
		status: "later",
	},
	{
		id: "autonomous-ticket-to-pr",
		title: msg({
			id: "marketing.roadmap.item.autonomousTicketToPr.title",
			message: "Autonomous ticket-to-PR pipeline",
		}),
		description: msg({
			id: "marketing.roadmap.item.autonomousTicketToPr.description",
			message:
				"File a ticket, get back a verified, merge-ready PR, with screenshots or a screencast as proof the change works.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "automations",
		title: msg({
			id: "marketing.roadmap.item.automations.title",
			message: "Automations & event triggers",
		}),
		description: msg({
			id: "marketing.roadmap.item.automations.description",
			message:
				"Scheduled and event-triggered agents (cron, GitHub events, webhooks) with ready-made templates.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "orchestration-chat",
		title: msg({
			id: "marketing.roadmap.item.orchestrationChat.title",
			message: "Orchestration chat",
		}),
		description: msg({
			id: "marketing.roadmap.item.orchestrationChat.description",
			message:
				"One chat that plans a task, fans out parallel agents across worktrees, and brings the results back together.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "self-verification",
		title: msg({
			id: "marketing.roadmap.item.selfVerification.title",
			message: "Agent self-verification",
		}),
		description: msg({
			id: "marketing.roadmap.item.selfVerification.description",
			message:
				"Agents load their own preview, drive the UI, and attach screenshot proof before marking work ready for review.",
		}),
		category: "Agents",
		status: "later",
	},
	{
		id: "session-snapshots",
		title: msg({
			id: "marketing.roadmap.item.sessionSnapshots.title",
			message: "Session snapshots & revert",
		}),
		description: msg({
			id: "marketing.roadmap.item.sessionSnapshots.description",
			message:
				"Roll back an agent session to any checkpoint, conversation and file changes together.",
		}),
		category: "Desktop",
		status: "later",
	},
	{
		id: "attention-queue",
		title: msg({
			id: "marketing.roadmap.item.attentionQueue.title",
			message: "Attention queue",
		}),
		description: msg({
			id: "marketing.roadmap.item.attentionQueue.description",
			message:
				"Always know which agent needs you, with notifications that deep-link straight to the blocked agent.",
		}),
		category: "Desktop",
		status: "later",
	},
	{
		id: "cloud-sandboxes",
		title: msg({
			id: "marketing.roadmap.item.cloudSandboxes.title",
			message: "Cloud sandboxes",
		}),
		description: msg({
			id: "marketing.roadmap.item.cloudSandboxes.description",
			message:
				"Machine-unbound cloud workspaces that spin up in seconds and can be shared with teammates.",
		}),
		category: "Platform",
		status: "later",
	},
	{
		id: "sdk-api",
		title: msg({
			id: "marketing.roadmap.item.sdkApi.title",
			message: "SDK & public API",
		}),
		description: msg({
			id: "marketing.roadmap.item.sdkApi.description",
			message:
				"Drive workspaces, agents, and sessions programmatically from scripts, CI, or your own tools.",
		}),
		category: "Platform",
		status: "later",
	},
	{
		id: "ios-app",
		title: msg({
			id: "marketing.roadmap.item.iosApp.title",
			message: "iOS app",
		}),
		description: msg({
			id: "marketing.roadmap.item.iosApp.description",
			message: "Monitor, steer, and unblock your agents from your phone.",
		}),
		category: "Mobile",
		status: "later",
	},

	// ── Shipped ──────────────────────────────────────
	{
		id: "offline-local-first",
		title: msg({
			id: "marketing.roadmap.item.offlineLocalFirst.title",
			message: "Offline / local-first mode",
		}),
		description: msg({
			id: "marketing.roadmap.item.offlineLocalFirst.description",
			message:
				"The full core loop (import a repo, run an agent, review the diff) now works signed out and offline.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		pr: "https://github.com/superset-sh/superset/pull/5731",
	},
	{
		id: "workspace-pinning-bulk-actions",
		title: msg({
			id: "marketing.roadmap.item.workspacePinningBulkActions.title",
			message: "Workspace pinning & bulk actions",
		}),
		description: msg({
			id: "marketing.roadmap.item.workspacePinningBulkActions.description",
			message:
				"Pin workspaces above your projects, then ⌘-click a batch to move, group, or delete them all at once.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-workspace-bulk-select.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "sidebar-redesign",
		title: msg({
			id: "marketing.roadmap.item.sidebarRedesign.title",
			message: "Cleaner, denser sidebar",
		}),
		description: msg({
			id: "marketing.roadmap.item.sidebarRedesign.description",
			message:
				"A full restyle: denser rows, port and agent chips under each workspace, one-click stop for everything.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-sidebar-redesign.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "grok-kimi-agents",
		title: msg({
			id: "marketing.roadmap.item.grokKimiAgents.title",
			message: "Grok & Kimi Code agents",
		}),
		description: msg({
			id: "marketing.roadmap.item.grokKimiAgents.description",
			message:
				"Grok and Kimi Code join the lineup alongside Claude Code, Codex, and friends.",
		}),
		category: "Agents",
		status: "shipped",
		shippedDate: "Aug 2026",
		image: "/changelog/2026-08-02-add-agent-picker.png",
		href: "/changelog/2026-08-02-workspace-pinning-bulk-actions",
	},
	{
		id: "stability-pass",
		title: msg({
			id: "marketing.roadmap.item.stabilityPass.title",
			message: "Stability improvements",
		}),
		description: msg({
			id: "marketing.roadmap.item.stabilityPass.description",
			message:
				"A focused burn-down of crashes, hangs, and reconnect failures across the app.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Aug 2026",
	},
	{
		id: "performance-pass",
		title: msg({
			id: "marketing.roadmap.item.performancePass.title",
			message: "Lighter memory, smoother under load",
		}),
		description: msg({
			id: "marketing.roadmap.item.performancePass.description",
			message:
				"Lower memory with many terminals open, smoother git in big repos, and less background CPU.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Jul 2026",
		image: "/changelog/2026-07-19-performance-summary.png",
		href: "/changelog/2026-07-19-performance-memory-and-load",
	},
	{
		id: "terminal-rich-input",
		title: msg({
			id: "marketing.roadmap.item.terminalRichInput.title",
			message: "Rich input for the terminal",
		}),
		description: msg({
			id: "marketing.roadmap.item.terminalRichInput.description",
			message:
				"Press ⌘I over any terminal and compose in a real editor, with multiline prompts and @file mentions.",
		}),
		category: "Desktop",
		status: "shipped",
		shippedDate: "Jul 2026",
		image: "/changelog/2026-07-12-rich-input-hero.png",
		href: "/changelog/2026-07-12-terminal-rich-input-mistral-vibe",
	},
	{
		id: "custom-terminal-agents",
		title: msg({
			id: "marketing.roadmap.item.customTerminalAgents.title",
			message: "Custom terminal agents",
		}),
		description: msg({
			id: "marketing.roadmap.item.customTerminalAgents.description",
			message:
				"Register any CLI agent alongside the built-ins, each with its own name, icon, and launch command.",
		}),
		category: "Agents",
		status: "shipped",
		shippedDate: "Jul 2026",
		href: "/changelog/2026-07-06-custom-agents-workspace-activity-fable",
	},
];
