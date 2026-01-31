import type { CloudEvent } from "../hooks";

/**
 * Extract just the filename from a file path
 */
function basename(filePath: string | undefined): string {
	if (!filePath) return "unknown";
	const parts = filePath.split("/");
	return parts[parts.length - 1] || filePath;
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(str: string | undefined, maxLen: number): string {
	if (!str) return "";
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen)}...`;
}

/**
 * Count lines in a string
 */
function countLines(str: string | undefined): number {
	if (!str) return 0;
	return str.split("\n").length;
}

export type ToolIconType =
	| "file"
	| "pencil"
	| "plus"
	| "terminal"
	| "search"
	| "folder"
	| "globe"
	| "box"
	| "list"
	| null;

export interface FormattedToolCall {
	toolName: string;
	summary: string;
	icon: ToolIconType;
	getDetails: () => { args?: Record<string, unknown>; output?: string };
}

/**
 * Format a tool call event for compact display
 */
export function formatToolCall(event: CloudEvent): FormattedToolCall {
	const data = event.data as {
		name?: string;
		input?: Record<string, unknown>;
		result?: unknown;
		error?: string;
	};

	const toolName = data.name || "Unknown";
	const args = data.input;
	const output =
		typeof data.result === "string"
			? data.result
			: data.result
				? JSON.stringify(data.result, null, 2)
				: data.error;

	switch (toolName) {
		case "Read": {
			const filePath = args?.file_path as string | undefined;
			const lineCount = countLines(output);
			return {
				toolName: "Read",
				summary: filePath
					? `${basename(filePath)}${lineCount > 0 ? ` (${lineCount} lines)` : ""}`
					: "file",
				icon: "file",
				getDetails: () => ({ args, output }),
			};
		}

		case "Edit": {
			const filePath = args?.file_path as string | undefined;
			return {
				toolName: "Edit",
				summary: filePath ? basename(filePath) : "file",
				icon: "pencil",
				getDetails: () => ({ args, output }),
			};
		}

		case "Write": {
			const filePath = args?.file_path as string | undefined;
			return {
				toolName: "Write",
				summary: filePath ? basename(filePath) : "file",
				icon: "plus",
				getDetails: () => ({ args, output }),
			};
		}

		case "Bash": {
			const command = args?.command as string | undefined;
			return {
				toolName: "Bash",
				summary: truncate(command, 50),
				icon: "terminal",
				getDetails: () => ({ args, output }),
			};
		}

		case "Grep": {
			const pattern = args?.pattern as string | undefined;
			const matchCount = output ? countLines(output) : 0;
			return {
				toolName: "Grep",
				summary: pattern
					? `"${truncate(pattern, 30)}"${matchCount > 0 ? ` (${matchCount} matches)` : ""}`
					: "search",
				icon: "search",
				getDetails: () => ({ args, output }),
			};
		}

		case "Glob": {
			const pattern = args?.pattern as string | undefined;
			const fileCount = output ? countLines(output) : 0;
			return {
				toolName: "Glob",
				summary: pattern
					? `${truncate(pattern, 30)}${fileCount > 0 ? ` (${fileCount} files)` : ""}`
					: "search",
				icon: "folder",
				getDetails: () => ({ args, output }),
			};
		}

		case "Task": {
			const description = args?.description as string | undefined;
			const prompt = args?.prompt as string | undefined;
			return {
				toolName: "Task",
				summary: description
					? truncate(description, 40)
					: prompt
						? truncate(prompt, 40)
						: "task",
				icon: "box",
				getDetails: () => ({ args, output }),
			};
		}

		case "WebFetch": {
			const url = args?.url as string | undefined;
			return {
				toolName: "WebFetch",
				summary: url ? truncate(url, 40) : "url",
				icon: "globe",
				getDetails: () => ({ args, output }),
			};
		}

		case "WebSearch": {
			const query = args?.query as string | undefined;
			return {
				toolName: "WebSearch",
				summary: query ? `"${truncate(query, 40)}"` : "search",
				icon: "search",
				getDetails: () => ({ args, output }),
			};
		}

		case "TodoWrite": {
			const todos = args?.todos as unknown[] | undefined;
			return {
				toolName: "TodoWrite",
				summary: todos
					? `${todos.length} item${todos.length === 1 ? "" : "s"}`
					: "todos",
				icon: "list",
				getDetails: () => ({ args, output }),
			};
		}

		default:
			return {
				toolName,
				summary:
					args && Object.keys(args).length > 0
						? truncate(JSON.stringify(args), 50)
						: "",
				icon: null,
				getDetails: () => ({ args, output }),
			};
	}
}

/**
 * Get a compact summary for a group of tool calls
 */
export function formatToolGroup(events: CloudEvent[]): {
	toolName: string;
	count: number;
	summary: string;
	icon: ToolIconType;
} {
	const firstEvent = events[0];
	if (!firstEvent) {
		return { toolName: "Unknown", count: 0, summary: "", icon: null };
	}

	const firstData = firstEvent.data as { name?: string };
	const toolName = firstData.name || "Unknown";
	const count = events.length;

	switch (toolName) {
		case "Read":
			return {
				toolName: "Read",
				count,
				summary: `${count} file${count === 1 ? "" : "s"}`,
				icon: "file",
			};

		case "Edit":
			return {
				toolName: "Edit",
				count,
				summary: `${count} file${count === 1 ? "" : "s"}`,
				icon: "pencil",
			};

		case "Write":
			return {
				toolName: "Write",
				count,
				summary: `${count} file${count === 1 ? "" : "s"}`,
				icon: "plus",
			};

		case "Bash":
			return {
				toolName: "Bash",
				count,
				summary: `${count} command${count === 1 ? "" : "s"}`,
				icon: "terminal",
			};

		case "Grep":
			return {
				toolName: "Grep",
				count,
				summary: `${count} search${count === 1 ? "" : "es"}`,
				icon: "search",
			};

		case "Glob":
			return {
				toolName: "Glob",
				count,
				summary: `${count} pattern${count === 1 ? "" : "s"}`,
				icon: "folder",
			};

		default:
			return {
				toolName,
				count,
				summary: `${count} call${count === 1 ? "" : "s"}`,
				icon: null,
			};
	}
}

/**
 * Group consecutive tool_call events of the same type
 */
export interface ToolCallGroupData {
	id: string;
	events: CloudEvent[];
	toolName: string;
}

export function groupToolCalls(events: CloudEvent[]): ToolCallGroupData[] {
	const groups: ToolCallGroupData[] = [];
	let currentGroup: ToolCallGroupData | null = null;

	for (const event of events) {
		if (event.type !== "tool_call") {
			if (currentGroup) {
				groups.push(currentGroup);
				currentGroup = null;
			}
			continue;
		}

		const data = event.data as { name?: string };
		const toolName = data.name || "Unknown";

		if (currentGroup && currentGroup.toolName === toolName) {
			currentGroup.events.push(event);
		} else {
			if (currentGroup) {
				groups.push(currentGroup);
			}
			currentGroup = {
				id: event.id,
				events: [event],
				toolName,
			};
		}
	}

	if (currentGroup) {
		groups.push(currentGroup);
	}

	return groups;
}
