import { isAbsolute, relative } from "node:path";
import type {
	Item,
	ToolCall,
	ToolContent,
	ToolKind,
} from "@superset/chat/protocol";
import type {
	CodexCommandAction,
	CodexFileUpdateChange,
	CodexKnownCommandAction,
	CodexThreadItem,
} from "../wire";
import { asKnownCommandAction, asKnownThreadItem } from "../wire";
import { parseFileDiff } from "./parseFileDiff";

export const TERMINAL_OUTPUT_LIMIT = 32_768;

export type MapItemContext = {
	cwd: string;
	startedAtMs: number;
	completedAtMs?: number;
};

export function displayPath(path: string, cwd: string): string {
	if (!isAbsolute(path)) return path;
	const relativePath = relative(cwd, path);
	if (relativePath === "" || relativePath.startsWith("..")) return path;
	return relativePath;
}

function truncateOutput(output: string): {
	text: string;
	truncated: boolean;
} {
	if (output.length <= TERMINAL_OUTPUT_LIMIT) {
		return { text: output, truncated: false };
	}
	return { text: output.slice(-TERMINAL_OUTPUT_LIMIT), truncated: true };
}

function toolCallStatus(status: string): ToolCall["status"] {
	switch (status) {
		case "inProgress":
			return "running";
		case "declined":
			return "declined";
		case "failed":
			return "failed";
		default:
			return "completed";
	}
}

function actionKind(action: CodexCommandAction): ToolKind {
	const known = asKnownCommandAction(action);
	if (!known) return "execute";
	return known.type === "read" ? "read" : "search";
}

export function commandActionTitle(
	action: CodexCommandAction,
	cwd: string,
): string {
	const known = asKnownCommandAction(action);
	if (!known) return action.command ?? "Run command";
	if (known.type === "read") return `Read ${known.name}`;
	if (known.type === "listFiles") {
		return known.path ? `List ${displayPath(known.path, cwd)}` : "List files";
	}
	const scope = known.path ? ` in ${displayPath(known.path, cwd)}` : "";
	return known.query ? `Search ${known.query}${scope}` : `Search${scope}`;
}

function actionPath(action: CodexKnownCommandAction): string | null {
	return action.path ?? null;
}

function commandTitle(
	actions: CodexCommandAction[],
	command: string,
	cwd: string,
): string {
	if (actions.length === 1 && actions[0]) {
		return commandActionTitle(actions[0], cwd);
	}
	if (actions.length > 1) {
		return actions.map((action) => action.command ?? "").join(" | ");
	}
	return command;
}

function commandKind(actions: CodexCommandAction[]): ToolKind {
	if (actions.length === 0) return "execute";
	const kinds = new Set(actions.map(actionKind));
	if (kinds.size === 1) {
		const [only] = [...kinds];
		if (only) return only;
	}
	return "execute";
}

function commandLocations(
	actions: CodexCommandAction[],
	cwd: string,
): { path: string }[] {
	const locations: { path: string }[] = [];
	for (const action of actions) {
		const known = asKnownCommandAction(action);
		const path = known ? actionPath(known) : null;
		if (path) locations.push({ path: displayPath(path, cwd) });
	}
	return locations;
}

function changeKind(change: CodexFileUpdateChange): ToolKind {
	if (change.kind.type === "delete") return "delete";
	if (change.kind.type === "update" && change.kind.move_path) return "move";
	return "edit";
}

function changeTitle(change: CodexFileUpdateChange, cwd: string): string {
	const path = displayPath(change.path, cwd);
	if (change.kind.type === "add") return `Create ${path}`;
	if (change.kind.type === "delete") return `Delete ${path}`;
	if (change.kind.type === "update" && change.kind.move_path) {
		return `Move ${path} to ${displayPath(change.kind.move_path, cwd)}`;
	}
	return `Edit ${path}`;
}

function fileChangeContent(
	changes: CodexFileUpdateChange[],
	cwd: string,
): ToolContent[] {
	return changes.map((change) => ({
		type: "diff" as const,
		path: displayPath(change.path, cwd),
		...parseFileDiff(change.kind.type, change.diff),
	}));
}

function mcpResultText(result: unknown, error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: unknown }).message);
	}
	if (result === null || result === undefined) return "";
	return JSON.stringify(result, null, 2);
}

export function mapThreadItem(
	codexItem: CodexThreadItem,
	context: MapItemContext,
): Item | null {
	const base = {
		id: codexItem.id,
		startedAtMs: context.startedAtMs,
		...(context.completedAtMs === undefined
			? {}
			: { completedAtMs: context.completedAtMs }),
	};

	const known = asKnownThreadItem(codexItem);
	if (!known) {
		return {
			...base,
			kind: "notice",
			noticeKind: "info",
			text: `Unmapped codex item: ${codexItem.type}`,
		};
	}

	switch (known.type) {
		case "userMessage":
			return null;

		case "agentMessage":
			return { ...base, kind: "agent_message", text: known.text };

		case "reasoning":
			return {
				...base,
				kind: "reasoning",
				text: known.content.join("\n\n"),
				...(known.summary.length > 0
					? { summary: known.summary.join("\n\n") }
					: {}),
			};

		case "plan":
			return {
				...base,
				kind: "plan",
				entries: [
					{
						text: known.text,
						status:
							context.completedAtMs === undefined ? "in_progress" : "completed",
					},
				],
			};

		case "commandExecution": {
			const actions = known.commandActions ?? [];
			const output = truncateOutput(known.aggregatedOutput ?? "");
			const locations = commandLocations(actions, context.cwd);
			return {
				...base,
				kind: "tool_call",
				title: commandTitle(actions, known.command, context.cwd),
				toolKind: commandKind(actions),
				toolName: "commandExecution",
				status: toolCallStatus(known.status),
				content: [
					{
						type: "terminal",
						command: known.command,
						output: output.text,
						...(known.exitCode === null || known.exitCode === undefined
							? {}
							: { exitCode: known.exitCode }),
						...(output.truncated ? { truncated: true } : {}),
					},
				],
				...(locations.length > 0 ? { locations } : {}),
				rawInput: { command: known.command, cwd: known.cwd },
				rawOutput: {
					exitCode: known.exitCode ?? null,
					durationMs: known.durationMs ?? null,
				},
			};
		}

		case "fileChange": {
			const [first] = known.changes;
			return {
				...base,
				kind: "tool_call",
				title:
					known.changes.length === 1 && first
						? changeTitle(first, context.cwd)
						: `Edit ${known.changes.length} files`,
				toolKind:
					known.changes.length === 1 && first ? changeKind(first) : "edit",
				toolName: "fileChange",
				status: toolCallStatus(known.status),
				content: fileChangeContent(known.changes, context.cwd),
				locations: known.changes.map((change) => ({
					path: displayPath(change.path, context.cwd),
				})),
				rawOutput: known.changes,
			};
		}

		case "mcpToolCall":
			return {
				...base,
				kind: "tool_call",
				title: `${known.tool} (${known.server})`,
				toolKind: "other",
				toolName: `${known.server}/${known.tool}`,
				status: toolCallStatus(known.status),
				content: [
					{
						type: "text",
						text: mcpResultText(known.result, known.error),
					},
				],
				rawInput: known.arguments,
				rawOutput: known.error ?? known.result,
			};

		case "dynamicToolCall":
			return {
				...base,
				kind: "tool_call",
				title: known.tool,
				toolKind: "other",
				toolName: known.namespace
					? `${known.namespace}/${known.tool}`
					: known.tool,
				status: toolCallStatus(known.status),
				content: (known.contentItems ?? []).map((content) => ({
					type: "text" as const,
					text: content.text ?? "",
				})),
				rawInput: known.arguments,
			};

		case "webSearch":
			return {
				...base,
				kind: "tool_call",
				title: `Web search: ${known.query}`,
				toolKind: "fetch",
				toolName: "webSearch",
				status: context.completedAtMs === undefined ? "running" : "completed",
				content: [],
				rawInput: { query: known.query },
			};

		case "imageView":
			return {
				...base,
				kind: "tool_call",
				title: `View ${displayPath(known.path, context.cwd)}`,
				toolKind: "read",
				toolName: "imageView",
				status: context.completedAtMs === undefined ? "running" : "completed",
				content: [],
				locations: [{ path: displayPath(known.path, context.cwd) }],
			};

		case "sleep":
			return {
				...base,
				kind: "tool_call",
				title: `Wait ${known.durationMs}ms`,
				toolKind: "other",
				toolName: "sleep",
				status: context.completedAtMs === undefined ? "running" : "completed",
				content: [],
			};

		case "contextCompaction":
			return { ...base, kind: "notice", noticeKind: "compaction" };

		case "enteredReviewMode":
			return {
				...base,
				kind: "notice",
				noticeKind: "info",
				text: `Entered review mode: ${known.review}`,
			};

		case "exitedReviewMode":
			return {
				...base,
				kind: "notice",
				noticeKind: "info",
				text: `Exited review mode: ${known.review}`,
			};

		case "subAgentActivity":
			return {
				...base,
				kind: "notice",
				noticeKind: "info",
				text: `Subagent ${known.kind}${known.agentPath ? `: ${known.agentPath}` : ""}`,
			};
	}
}
