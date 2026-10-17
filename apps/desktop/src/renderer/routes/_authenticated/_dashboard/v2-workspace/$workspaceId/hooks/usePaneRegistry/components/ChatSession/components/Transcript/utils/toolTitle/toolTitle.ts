import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import { fileChangeOf } from "../fileChange";
import {
	type ShellIntent,
	type ShellVerb,
	toolCallCommand,
	toolCallIntent,
	unwrapShellCommand,
} from "../shellIntent";

const translate = (message: MessageDescriptor) => i18n._(message);

const SHELL_VERBS = {
	read: {
		running: msg({ message: "Reading", context: "shell intent" }),
		settled: msg({ message: "Read", context: "shell intent" }),
	},
	search: {
		running: msg({ message: "Searching", context: "shell intent" }),
		settled: msg({ message: "Searched", context: "shell intent" }),
	},
	list: {
		running: msg({ message: "Listing", context: "shell intent" }),
		settled: msg({ message: "Listed", context: "shell intent" }),
	},
	write: {
		running: msg({ message: "Writing", context: "shell intent" }),
		settled: msg({ message: "Wrote", context: "shell intent" }),
	},
	edit: {
		running: msg({ message: "Editing", context: "shell intent" }),
		settled: msg({ message: "Edited", context: "shell intent" }),
	},
} satisfies Record<ShellVerb, unknown>;

export type ToolTitle = {
	label: string;
	change: ReturnType<typeof fileChangeOf>;
	/** A shell command that only read, searched, listed or wrote. */
	intent: ShellIntent | null;
	/** The label is the command itself, so it is set in mono. */
	command: boolean;
};

export function toolTitle(
	item: ToolCall,
	t = translate,
	pluginAvailable = false,
): ToolTitle {
	const change = fileChangeOf(item);
	const running = item.status === "running";
	if (change) {
		const verb = running
			? change.kind === "added"
				? msg({ message: "Creating", context: "file change" })
				: change.kind === "deleted"
					? msg({ message: "Deleting", context: "file change" })
					: msg({ message: "Editing", context: "file change" })
			: change.kind === "added"
				? msg({ message: "Created", context: "file change" })
				: change.kind === "deleted"
					? msg({ message: "Deleted", context: "file change" })
					: msg({ message: "Edited", context: "file change" });
		return { label: t(verb), change, intent: null, command: false };
	}
	const intent = toolCallIntent(item);
	if (intent) {
		const verb = SHELL_VERBS[intent.verb][running ? "running" : "settled"];
		return { label: t(verb), change: null, intent, command: false };
	}
	const mcpServer = item.mcpServer;
	const rawMcpTitle =
		!item.title ||
		item.title.startsWith("mcp__") ||
		item.title === `${mcpServer?.tool} (${mcpServer?.name})`;
	const execute = item.toolKind === "execute";
	const shell = execute ? toolCallCommand(item) : null;
	// A description the agent wrote is prose; only the command itself is mono.
	const titleIsCommand = shell === null || item.title.endsWith(shell);
	const label =
		pluginAvailable && mcpServer && rawMcpTitle
			? mcpServer.tool
			: running && execute && item.title === "Terminal"
				? t(msg({ message: "Running" }))
				: shell && titleIsCommand
					? item.title.slice(0, -shell.length) + unwrapShellCommand(shell)
					: item.title;
	return {
		label,
		change: null,
		intent: null,
		command: execute && titleIsCommand,
	};
}

export function toolTitleText(
	item: ToolCall,
	t = translate,
	pluginAvailable = false,
): string {
	const { label, change, intent } = toolTitle(item, t, pluginAvailable);
	if (change) return `${label} ${change.name}`;
	if (intent) return `${label} ${intent.query ?? intent.path ?? ""}`.trim();
	return label;
}
