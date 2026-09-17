import { env } from "@/env";

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

export interface IssueData {
	identifier: string;
	title: string;
	url: string;
}

export interface PullRequestData {
	number: number;
	title: string;
	url: string;
}

export interface LaunchedAgentData {
	/** The terminal id `agents_create` returns as `sessionId`. */
	sessionId: string;
	label: string;
	workspaceId: string;
	/** Host machineId; absent for a cloud workspace. */
	hostId?: string;
	workspaceName?: string;
	workspaceBranch?: string;
}

export type AgentAction =
	| {
			type: "task_created" | "task_updated" | "task_deleted";
			tasks: TaskData[];
	  }
	| {
			type: "workspace_created" | "workspace_switched";
			workspaces: WorkspaceData[];
	  }
	| { type: "issue_created"; issues: IssueData[] }
	| { type: "pr_opened"; pullRequests: PullRequestData[] }
	| { type: "agent_launched"; agents: LaunchedAgentData[] };

function escapeMrkdwn(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function actionLines(actions: AgentAction[]): string[] {
	const lines: string[] = [];

	for (const action of actions) {
		if (action.type === "task_created") {
			for (const task of action.tasks) {
				const url = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;
				lines.push(`Created task <${url}|${task.slug}>`);
			}
		} else if (action.type === "task_updated") {
			for (const task of action.tasks) {
				const url = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;
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
		} else if (action.type === "issue_created") {
			for (const issue of action.issues) {
				lines.push(
					`Created issue <${issue.url}|${issue.identifier}> ${escapeMrkdwn(issue.title)}`,
				);
			}
		} else if (action.type === "pr_opened") {
			for (const pr of action.pullRequests) {
				lines.push(
					`Opened pull request <${pr.url}|#${pr.number}> ${escapeMrkdwn(pr.title)}`,
				);
			}
		} else if (action.type === "agent_launched") {
			for (const agent of action.agents) {
				lines.push(
					`Launched *${agent.label}*${agent.workspaceName ? ` in workspace *${agent.workspaceName}*` : ""}`,
				);
			}
		}
	}

	return lines;
}

export function formatActionsAsText(actions: AgentAction[]): string {
	return actionLines(actions).join("\n");
}

export function formatSideEffectsMessage(actions: AgentAction[]): string {
	return `*Changes:*\n${actionLines(actions)
		.map((line) => `• ${line}`)
		.join("\n")}`;
}
