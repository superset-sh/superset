import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { UserQuestionTool } from "@superset/ui/ai-elements/user-question-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { getToolName } from "ai";
import { FileIcon, FolderIcon, MessageCircleQuestionIcon } from "lucide-react";
import { READ_ONLY_TOOLS } from "../../constants";
import type { ToolPart } from "../../utils/tool-helpers";
import {
	getArgs,
	getResult,
	normalizeToolName,
	toWsToolState,
} from "../../utils/tool-helpers";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";
import { GenericToolCall } from "./components/GenericToolCall";

interface MastraToolCallBlockProps {
	part: ToolPart;
	onAnswer?: (toolCallId: string, answers: Record<string, string>) => void;
}

export function MastraToolCallBlock({
	part,
	onAnswer,
}: MastraToolCallBlockProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const state = toWsToolState(part);
	const toolName = normalizeToolName(getToolName(part));
	const toolDisplayName = toolName
		.replace("mastra_workspace_", "")
		.replaceAll("_", " ");

	const outputObject =
		typeof result.output === "object" && result.output !== null
			? (result.output as Record<string, unknown>)
			: undefined;
	const nestedResultObject =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: undefined;

	const toText = (value: unknown): string | undefined => {
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}
		if (Array.isArray(value)) {
			const parts = value
				.map((item) => (typeof item === "string" ? item : String(item)))
				.filter(Boolean);
			return parts.length > 0 ? parts.join("\n") : undefined;
		}
		return undefined;
	};

	const firstText = (...values: unknown[]): string | undefined => {
		for (const value of values) {
			const text = toText(value);
			if (text && text.trim().length > 0) return text;
		}
		return undefined;
	};

	const toNumber = (value: unknown): number | undefined => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		}
		return undefined;
	};

	// --- Execute command → BashTool ---
	if (toolName === "mastra_workspace_execute_command") {
		const command = String(
			args.command ??
				args.cmd ??
				args.command_line ??
				args.commandLine ??
				args.raw ??
				"",
		);
		const stdout =
			firstText(
				result.stdout,
				result.stdout_text,
				result.stdoutText,
				outputObject?.stdout,
				outputObject?.stdout_text,
				outputObject?.stdoutText,
				nestedResultObject?.stdout,
				nestedResultObject?.stdout_text,
				nestedResultObject?.stdoutText,
				result.combined_output,
				result.combinedOutput,
				outputObject?.combined_output,
				outputObject?.combinedOutput,
				result.output_text,
				result.outputText,
				result.text,
				typeof result.output === "string" ? result.output : undefined,
				typeof result.result === "string" ? result.result : undefined,
			) ??
			(typeof result.output === "object" && result.output !== null
				? JSON.stringify(result.output, null, 2)
				: undefined);
		const stderr = firstText(
			result.stderr,
			result.stderr_text,
			result.stderrText,
			outputObject?.stderr,
			outputObject?.stderr_text,
			outputObject?.stderrText,
			nestedResultObject?.stderr,
			nestedResultObject?.stderr_text,
			nestedResultObject?.stderrText,
			result.error,
			result.errorText,
			outputObject?.error,
			outputObject?.errorText,
			nestedResultObject?.error,
			nestedResultObject?.errorText,
		);
		const exitCode = toNumber(
			result.exitCode ??
				result.exit_code ??
				result.code ??
				result.status_code ??
				outputObject?.exitCode ??
				outputObject?.exit_code ??
				outputObject?.code ??
				outputObject?.status_code ??
				nestedResultObject?.exitCode ??
				nestedResultObject?.exit_code ??
				nestedResultObject?.code ??
				nestedResultObject?.status_code,
		);
		return (
			<BashTool
				command={command}
				stdout={stdout}
				stderr={stderr}
				exitCode={exitCode}
				state={state}
			/>
		);
	}

	// --- Write file → FileDiffTool (write mode) ---
	if (toolName === "mastra_workspace_write_file") {
		const filePath = String(args.path ?? args.filePath ?? "");
		const content = String(args.content ?? args.data ?? "");
		return (
			<FileDiffTool
				filePath={filePath}
				content={content}
				isWriteMode
				state={state}
			/>
		);
	}

	// --- Edit file → FileDiffTool (diff mode) ---
	if (toolName === "mastra_workspace_edit_file") {
		const filePath = String(args.path ?? args.filePath ?? "");
		const oldString = String(args.oldString ?? args.old_string ?? "");
		const newString = String(args.newString ?? args.new_string ?? "");
		return (
			<FileDiffTool
				filePath={filePath}
				oldString={oldString}
				newString={newString}
				state={state}
			/>
		);
	}

	// --- Web search → WebSearchTool ---
	if (toolName === "web_search") {
		const query = String(args.query ?? "");
		const rawResults = Array.isArray(result.results) ? result.results : [];
		const results = (
			rawResults as Array<{ title?: string; url?: string }>
		).filter(
			(r): r is { title: string; url: string } =>
				typeof r.title === "string" && typeof r.url === "string",
		);
		return <WebSearchTool query={query} results={results} state={state} />;
	}

	// --- Web fetch → WebFetchTool ---
	if (toolName === "web_fetch") {
		const url = String(args.url ?? "");
		const content =
			typeof result.content === "string" ? result.content : undefined;
		const bytes = typeof result.bytes === "number" ? result.bytes : undefined;
		const statusCode =
			typeof result.status_code === "number"
				? result.status_code
				: typeof result.statusCode === "number"
					? result.statusCode
					: undefined;
		return (
			<WebFetchTool
				url={url}
				content={content}
				bytes={bytes}
				statusCode={statusCode}
				state={state}
			/>
		);
	}

	// --- Ask user question → UserQuestionTool ---
	if (toolName === "ask_user_question") {
		const questions = Array.isArray(args.questions) ? args.questions : [];

		if (part.state === "output-available" || part.state === "output-error") {
			return (
				<GenericToolCall
					part={part}
					toolName="Question"
					icon={MessageCircleQuestionIcon}
				/>
			);
		}

		return (
			<UserQuestionTool
				questions={questions}
				onAnswer={(answers) => onAnswer?.(part.toolCallId, answers)}
				onSkip={() => onAnswer?.(part.toolCallId, {})}
			/>
		);
	}

	// --- Read-only exploration tools ---
	if (READ_ONLY_TOOLS.has(toolName)) {
		return <ReadOnlyToolCall part={part} />;
	}

	// --- Destructive workspace tools ---
	if (toolName === "mastra_workspace_mkdir") {
		return (
			<GenericToolCall
				part={part}
				toolName="Create directory"
				icon={FolderIcon}
			/>
		);
	}

	if (toolName === "mastra_workspace_delete") {
		return (
			<GenericToolCall part={part} toolName="Delete path" icon={FileIcon} />
		);
	}

	// --- Fallback: generic tool UI ---
	return <GenericToolCall part={part} toolName={toolDisplayName} />;
}
