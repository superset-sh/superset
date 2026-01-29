import type { KnownBlock, MessageAttachment } from "@slack/web-api";

import { env } from "@/env";

// Action types the agent can perform
export type AgentActionType =
	| "task_created"
	| "task_updated"
	| "task_deleted"
	| "workspace_created"
	| "workspace_switched";

export interface TaskData {
	id: string;
	slug: string;
	title: string;
	description?: string | null;
	status?: string;
	priority?: string;
}

export interface WorkspaceData {
	id: string;
	name: string;
	branch?: string;
}

export type AgentAction =
	| {
			type: "task_created" | "task_updated" | "task_deleted";
			tasks: TaskData[];
	  }
	| {
			type: "workspace_created" | "workspace_switched";
			workspaces: WorkspaceData[];
	  };

type TaskActionType = "task_created" | "task_updated" | "task_deleted";

// Superset logo for attachment cards
const SUPERSET_ICON_URL = "https://superset.sh/favicon-192.png";

/**
 * Formats actions into simple text with URLs (for unfurling).
 * Used when we have actions - we skip the agent's text and use this instead.
 * URLs use web app domain to match unfurl_domains and trigger Slack unfurling.
 */
// Production web app URL for unfurl links (localhost won't unfurl)
const WEB_APP_URL = "https://app.superset.sh";

export function formatActionsAsText(actions: AgentAction[]): string {
	const lines: string[] = [];

	for (const action of actions) {
		if (action.type === "task_created") {
			for (const task of action.tasks) {
				const url = `${WEB_APP_URL}/tasks/${task.slug}`;
				lines.push(`Created task <${url}|${task.slug}>`);
			}
		} else if (action.type === "task_updated") {
			for (const task of action.tasks) {
				const url = `${WEB_APP_URL}/tasks/${task.slug}`;
				lines.push(`Updated task <${url}|${task.slug}>`);
			}
		} else if (action.type === "task_deleted") {
			for (const task of action.tasks) {
				lines.push(`Deleted task ${task.slug}`);
			}
		} else if (action.type === "workspace_created") {
			for (const ws of action.workspaces) {
				lines.push(
					`Created workspace *${ws.name}*${ws.branch ? ` on branch \`${ws.branch}\`` : ""}`,
				);
			}
		} else if (action.type === "workspace_switched") {
			for (const ws of action.workspaces) {
				lines.push(`Switched to workspace *${ws.name}*`);
			}
		}
	}

	return lines.join("\n");
}

/**
 * Creates a rich attachment card for a single task (Linear-style).
 * Matches Linear's clean design: icon, title, subtitle, description, status.
 */
function createTaskAttachment(
	task: TaskData,
	_actionType: TaskActionType,
): MessageAttachment {
	const taskUrl = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;

	const fields: { title: string; value: string; short: boolean }[] = [];

	// Add status field
	if (task.status) {
		fields.push({
			title: "Status",
			value: task.status,
			short: true,
		});
	}

	// Add priority field if set and not "none"
	if (task.priority && task.priority !== "none") {
		fields.push({
			title: "Priority",
			value: formatPriority(task.priority),
			short: true,
		});
	}

	// Build description with task ID subtitle
	const subtitle = `Task ${task.slug} in Superset`;
	const text = task.description
		? `${subtitle}\n\n${task.description}`
		: subtitle;

	return {
		color: "#7C3AED", // Superset purple
		author_icon: SUPERSET_ICON_URL,
		author_name: task.title,
		author_link: taskUrl,
		text,
		fields: fields.length > 0 ? fields : undefined,
		ts: String(Math.floor(Date.now() / 1000)),
	};
}

/**
 * Creates a rich attachment card for a workspace (Linear-style).
 */
function createWorkspaceAttachment(
	workspace: WorkspaceData,
	_actionType: "workspace_created" | "workspace_switched",
): MessageAttachment {
	const deepLink = `superset://workspace/${workspace.id}`;

	const fields: { title: string; value: string; short: boolean }[] = [];

	if (workspace.branch) {
		fields.push({
			title: "Branch",
			value: `\`${workspace.branch}\``,
			short: true,
		});
	}

	const subtitle = `Workspace in Superset`;

	return {
		color: "#7C3AED", // Superset purple
		author_icon: SUPERSET_ICON_URL,
		author_name: workspace.name,
		author_link: deepLink,
		text: subtitle,
		fields: fields.length > 0 ? fields : undefined,
		ts: String(Math.floor(Date.now() / 1000)),
	};
}

/**
 * Creates attachments for an agent action.
 */
function createActionAttachments(action: AgentAction): MessageAttachment[] {
	const attachments: MessageAttachment[] = [];

	// Handle task actions
	if (
		action.type === "task_created" ||
		action.type === "task_updated" ||
		action.type === "task_deleted"
	) {
		for (const task of action.tasks) {
			attachments.push(createTaskAttachment(task, action.type));
		}
	}

	// Handle workspace actions
	if (
		action.type === "workspace_created" ||
		action.type === "workspace_switched"
	) {
		for (const workspace of action.workspaces) {
			attachments.push(createWorkspaceAttachment(workspace, action.type));
		}
	}

	return attachments;
}

/**
 * Creates the full message response for a Slack agent.
 * Returns text, blocks for the main message, and attachments for rich cards.
 */
export function createAgentResponse({
	text,
	actions,
}: {
	text: string;
	actions: AgentAction[];
}): {
	text: string;
	blocks: KnownBlock[];
	attachments: MessageAttachment[];
} {
	const blocks: KnownBlock[] = [];
	const attachments: MessageAttachment[] = [];

	// Add text as a block
	if (text) {
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text,
			},
		});
	}

	// Add attachments for each action
	for (const action of actions) {
		const hasItems =
			("tasks" in action && action.tasks.length > 0) ||
			("workspaces" in action && action.workspaces.length > 0);

		if (hasItems) {
			attachments.push(...createActionAttachments(action));
		}
	}

	return { text, blocks, attachments };
}

// Keep the old function for backwards compatibility but mark as deprecated
/** @deprecated Use createAgentResponse instead */
export function createAgentResponseBlocks({
	text,
	actions,
}: {
	text: string;
	actions: AgentAction[];
}): KnownBlock[] {
	return createAgentResponse({ text, actions }).blocks;
}

function formatPriority(priority: string): string {
	const labels: Record<string, string> = {
		urgent: "🔴 Urgent",
		high: "🟠 High",
		medium: "🟡 Medium",
		low: "🟢 Low",
		none: "None",
	};
	return labels[priority] ?? priority;
}
