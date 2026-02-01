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

export type AgentAction =
	| {
			type: "task_created" | "task_updated" | "task_deleted";
			tasks: TaskData[];
	  }
	| {
			type: "workspace_created" | "workspace_switched";
			workspaces: WorkspaceData[];
	  };

export function formatActionsAsText(actions: AgentAction[]): string {
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
		}
	}

	return lines.join("\n");
}

export function formatSideEffectsMessage(actions: AgentAction[]): string {
	const lines: string[] = [];

	for (const action of actions) {
		if (action.type === "task_created") {
			for (const task of action.tasks) {
				const url = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;
				lines.push(`• Created task <${url}|${task.slug}>`);
			}
		} else if (action.type === "task_updated") {
			for (const task of action.tasks) {
				const url = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;
				lines.push(`• Updated task <${url}|${task.slug}>`);
			}
		} else if (action.type === "task_deleted") {
			for (const task of action.tasks) {
				lines.push(`• Deleted task ${task.slug}`);
			}
		} else if (action.type === "workspace_created") {
			for (const ws of action.workspaces) {
				lines.push(
					`• Created workspace *${ws.name}*${ws.branch ? ` on branch \`${ws.branch}\`` : ""}`,
				);
			}
		} else if (action.type === "workspace_switched") {
			for (const ws of action.workspaces) {
				lines.push(`• Switched to workspace *${ws.name}*`);
			}
		}
	}

	return `*Changes:*\n${lines.join("\n")}`;
}
