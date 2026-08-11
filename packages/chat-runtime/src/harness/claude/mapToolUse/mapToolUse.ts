import { basename, isAbsolute, relative } from "node:path";
import type { ToolContent, ToolKind } from "@superset/chat/protocol";

export type ToolUse = {
	id: string;
	name: string;
	input: Record<string, unknown>;
};

export type ToolOutcome = {
	rawOutput: unknown;
	modelFacingText: string;
	isError: boolean;
};

const TOOL_KINDS: Record<string, ToolKind> = {
	Read: "read",
	NotebookRead: "read",
	Edit: "edit",
	MultiEdit: "edit",
	Write: "edit",
	NotebookEdit: "edit",
	Bash: "execute",
	BashOutput: "execute",
	KillShell: "execute",
	Glob: "search",
	Grep: "search",
	ToolSearch: "search",
	WebFetch: "fetch",
	WebSearch: "fetch",
	Task: "other",
	Agent: "other",
};

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function displayPath(value: unknown, cwd: string): string | null {
	const raw = text(value);
	if (!raw) return null;
	if (!isAbsolute(raw)) return raw;
	const inside = relative(cwd, raw);
	return inside && !inside.startsWith("..") ? inside : basename(raw);
}

export function toolKindFor(name: string): ToolKind {
	return TOOL_KINDS[name] ?? "other";
}

export function titleFor(use: ToolUse, cwd: string): string {
	const path = displayPath(use.input.file_path, cwd);
	switch (use.name) {
		case "Read":
			return path ? `Reading ${path}` : "Reading a file";
		case "Edit":
		case "MultiEdit":
			return path ? `Editing ${path}` : "Editing a file";
		case "Write":
			return path ? `Creating ${path}` : "Creating a file";
		case "NotebookEdit":
			return path ? `Editing notebook ${path}` : "Editing a notebook";
		case "Bash":
			return (
				text(use.input.description) ??
				(text(use.input.command)
					? `Running ${text(use.input.command)}`
					: "Running a command")
			);
		case "Glob":
		case "Grep":
			return text(use.input.pattern)
				? `Searching for ${text(use.input.pattern)}`
				: "Searching";
		case "ToolSearch":
			return text(use.input.query)
				? `Finding tools for ${text(use.input.query)}`
				: "Finding tools";
		case "WebFetch":
			return text(use.input.url)
				? `Fetching ${text(use.input.url)}`
				: "Fetching";
		case "WebSearch":
			return text(use.input.query)
				? `Searching the web for ${text(use.input.query)}`
				: "Searching the web";
		case "Task":
		case "Agent":
			return (
				text(use.input.description) ??
				text(use.input.subject) ??
				"Subagent task"
			);
		default:
			return use.name;
	}
}

function applyEdit(
	original: string,
	oldString: string,
	newString: string,
	replaceAll: boolean,
): string {
	return replaceAll
		? original.split(oldString).join(newString)
		: original.replace(oldString, newString);
}

type EditStep = {
	oldString: string;
	newString: string;
	replaceAll: boolean;
};

function editSteps(
	use: ToolUse,
	output: Record<string, unknown> | null,
): EditStep[] {
	const edits = Array.isArray(use.input.edits) ? use.input.edits : null;
	if (edits) {
		return edits.flatMap((raw) => {
			const step = raw as Record<string, unknown>;
			const oldString = text(step.old_string);
			if (oldString === null) return [];
			return [
				{
					oldString,
					newString: text(step.new_string) ?? "",
					replaceAll: step.replace_all === true,
				},
			];
		});
	}

	const oldString = text(output?.oldString) ?? text(use.input.old_string);
	if (oldString === null) return [];
	return [
		{
			oldString,
			newString: text(output?.newString) ?? text(use.input.new_string) ?? "",
			replaceAll: output?.replaceAll === true || use.input.replace_all === true,
		},
	];
}

function editContent(use: ToolUse, outcome: ToolOutcome | null): ToolContent[] {
	const output =
		outcome && typeof outcome.rawOutput === "object" && outcome.rawOutput
			? (outcome.rawOutput as Record<string, unknown>)
			: null;

	const path =
		text(output?.filePath) ?? text(use.input.file_path) ?? "unknown file";
	const original = text(output?.originalFile);
	const steps = editSteps(use, output);

	if (original === null || steps.length === 0) return [];
	const newText = steps.reduce(
		(current, step) =>
			applyEdit(current, step.oldString, step.newString, step.replaceAll),
		original,
	);

	return [{ type: "diff", path, oldText: original, newText }];
}

function subagentContent(outcome: ToolOutcome | null): ToolContent[] {
	const output =
		outcome && typeof outcome.rawOutput === "object" && outcome.rawOutput
			? (outcome.rawOutput as Record<string, unknown>)
			: null;

	const report =
		text(output?.report) ?? text(output?.result) ?? text(output?.output);
	return report ? [{ type: "text", text: report }] : [];
}

function writeContent(use: ToolUse): ToolContent[] {
	const path = text(use.input.file_path);
	if (!path) return [];
	return [
		{
			type: "diff",
			path,
			oldText: null,
			newText: text(use.input.content) ?? "",
		},
	];
}

function terminalContent(
	use: ToolUse,
	outcome: ToolOutcome | null,
): ToolContent[] {
	const command = text(use.input.command) ?? "";
	const output =
		outcome && typeof outcome.rawOutput === "object" && outcome.rawOutput
			? (outcome.rawOutput as Record<string, unknown>)
			: null;

	const stdout = text(output?.stdout) ?? "";
	const stderr = text(output?.stderr) ?? "";
	const combined = output
		? [stdout, stderr].filter((part) => part.length > 0).join("\n")
		: (outcome?.modelFacingText ?? "");

	return [{ type: "terminal", command, output: combined }];
}

export function contentFor(
	use: ToolUse,
	outcome: ToolOutcome | null,
): ToolContent[] {
	switch (use.name) {
		case "Edit":
		case "MultiEdit":
			return editContent(use, outcome);
		case "Write":
			return writeContent(use);
		case "Bash":
			return terminalContent(use, outcome);
		case "Task":
		case "Agent":
			return subagentContent(outcome);
		default: {
			const body = outcome?.modelFacingText;
			return body ? [{ type: "text", text: body }] : [];
		}
	}
}

export function locationsFor(
	use: ToolUse,
): { path: string; line?: number }[] | undefined {
	const path = text(use.input.file_path);
	return path ? [{ path }] : undefined;
}
