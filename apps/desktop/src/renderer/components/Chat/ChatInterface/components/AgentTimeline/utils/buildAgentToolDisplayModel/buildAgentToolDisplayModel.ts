import {
	type AgentToolKind,
	classifyAgentToolName,
} from "@superset/chat/shared";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import {
	getArgs,
	getResult,
	toWsToolState,
} from "renderer/components/Chat/ChatInterface/utils/tool-helpers";

export interface AgentToolDisplayModel {
	kind: AgentToolKind;
	title: string;
	summary: string;
	status: "running" | "ready" | "done" | "error";
	error?: string;
	details: Array<{ label: string; value: string }>;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
}

function toText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value.map(toText).filter(Boolean).join("\n");
	}
	if (value && typeof value === "object") {
		return JSON.stringify(value, null, 2);
	}
	return "";
}

function firstText(...values: unknown[]): string {
	for (const value of values) {
		const text = toText(value).trim();
		if (text) return text;
	}
	return "";
}

function titleCase(value: string): string {
	return value
		.replace(/^mastra_workspace_/, "")
		.replaceAll("_", " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toStatus(part: ToolPart): AgentToolDisplayModel["status"] {
	const state = toWsToolState(part);
	if (state === "output-error") return "error";
	if (state === "output-available") return "done";
	if (state === "input-streaming") return "running";
	return "ready";
}

function addDetail(
	details: AgentToolDisplayModel["details"],
	label: string,
	value: unknown,
) {
	const text = toText(value).trim();
	if (!text) return;
	details.push({ label, value: text });
}

export function buildAgentToolDisplayModel(
	part: ToolPart,
): AgentToolDisplayModel {
	const args = getArgs(part);
	const result = getResult(part);
	const errorText =
		part.state === "output-error" &&
		"errorText" in part &&
		typeof part.errorText === "string"
			? part.errorText
			: "";
	const rawName = String(part.type).replace(/^tool-/, "");
	const toolClassification = classifyAgentToolName(rawName);
	const toolName = toolClassification.canonicalName;
	const status = toStatus(part);
	const details: AgentToolDisplayModel["details"] = [];

	if (toolName === "mastra_workspace_execute_command") {
		const command = firstText(args.command, args.cmd, args.script);
		const stdout = firstText(result.stdout, result.output, result.content);
		const stderr = firstText(result.stderr, result.error, errorText);
		addDetail(details, "Command", command);
		addDetail(details, "Stdout", stdout);
		addDetail(details, "Stderr", stderr);
		addDetail(details, "Exit", result.exitCode ?? result.exit_code);
		return {
			kind: "shell",
			title: "Shell",
			summary: command || "Run shell command",
			status,
			...(stderr && status === "error" ? { error: stderr } : {}),
			details,
			args,
			result,
		};
	}

	if (toolName === "mastra_workspace_read_file") {
		const path = firstText(args.path, args.filePath, args.file_path, args.file);
		addDetail(details, "Path", path);
		addDetail(details, "Content", result.content ?? result.text);
		return {
			kind: "read",
			title: "Read",
			summary: path || "Read file",
			status,
			details,
			args,
			result,
		};
	}

	if (toolName === "mastra_workspace_write_file") {
		const path = firstText(args.path, args.filePath, args.file_path, args.file);
		addDetail(details, "Path", path);
		addDetail(details, "Content", args.content ?? args.data);
		return {
			kind: "write",
			title: "Write",
			summary: path || "Write file",
			status,
			details,
			args,
			result,
		};
	}

	if (
		toolName === "mastra_workspace_edit_file" ||
		toolName === "ast_smart_edit"
	) {
		const path = firstText(
			args.path,
			args.filePath,
			args.file_path,
			args.target_file,
			args.targetPath,
		);
		addDetail(details, "Path", path);
		addDetail(details, "Find", args.oldString ?? args.old_string ?? args.find);
		addDetail(
			details,
			"Replace",
			args.newString ?? args.new_string ?? args.replacement,
		);
		addDetail(
			details,
			"Patch",
			result.structuredPatch ?? result.structured_patch,
		);
		return {
			kind: "edit",
			title: "Edit",
			summary: path || "Edit file",
			status,
			details,
			args,
			result,
		};
	}

	if (
		toolName === "mastra_workspace_search" ||
		toolName === "mastra_workspace_list_files"
	) {
		const query = firstText(args.query, args.pattern, args.glob, args.path);
		addDetail(details, "Query", query);
		addDetail(
			details,
			"Results",
			result.results ?? result.files ?? result.content,
		);
		return {
			kind: "search",
			title:
				toolName === "mastra_workspace_list_files" ? "Search Files" : "Search",
			summary: query || "Search workspace",
			status,
			details,
			args,
			result,
		};
	}

	if (toolName === "web_fetch" || toolName === "web_search") {
		const target = firstText(args.url, args.query);
		addDetail(details, toolName === "web_fetch" ? "URL" : "Query", target);
		addDetail(
			details,
			"Result",
			result.content ?? result.results ?? result.text,
		);
		return {
			kind: "fetch",
			title: toolName === "web_fetch" ? "Fetch" : "Web Search",
			summary: target || titleCase(toolName),
			status,
			details,
			args,
			result,
		};
	}

	if (toolName === "subagent") {
		const prompt = firstText(args.prompt, args.description, args.task);
		const agentType = firstText(args.subagent_type, args.agent_type);
		addDetail(details, "Agent", agentType);
		addDetail(details, "Prompt", prompt);
		addDetail(
			details,
			"Result",
			result.content ?? result.summary ?? result.text,
		);
		return {
			kind: "subagent",
			title: "Subagent",
			summary: prompt || agentType || "Run subagent",
			status,
			details,
			args,
			result,
		};
	}

	if (toolName === "skill") {
		const skill = firstText(args.skill, args.name, args.command);
		addDetail(details, "Skill", skill);
		addDetail(details, "Input", args.input ?? args.prompt);
		addDetail(
			details,
			"Result",
			result.content ?? result.summary ?? result.text,
		);
		return {
			kind: "skill",
			title: "Skill",
			summary: skill || "Run skill",
			status,
			details,
			args,
			result,
		};
	}

	addDetail(details, "Input", args);
	addDetail(details, "Result", result);
	return {
		kind: "unknown",
		title:
			toolClassification.displayName ||
			titleCase(toolName || rawName || "tool"),
		summary:
			toolClassification.displayName ||
			titleCase(toolName || rawName || "tool"),
		status,
		details,
		args,
		result,
	};
}
