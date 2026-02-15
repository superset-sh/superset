import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import { ToolCall } from "@superset/ui/ai-elements/tool-call";
import { UserQuestionTool } from "@superset/ui/ai-elements/user-question-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { FileIcon, FolderIcon, MessageCircleQuestionIcon } from "lucide-react";
import { READ_ONLY_TOOLS } from "../../constants";
import type { ToolCallPart } from "../../types";
import {
	getArgs,
	getResult,
	toToolDisplayState,
	toWsToolState,
} from "../../utils/tool-helpers";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";

interface MastraToolCallBlockProps {
	part: ToolCallPart;
	onAnswer?: (toolCallId: string, answers: Record<string, string>) => void;
}

export function MastraToolCallBlock({
	part,
	onAnswer,
}: MastraToolCallBlockProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const state = toWsToolState(part);

	// --- Execute command → BashTool ---
	if (part.toolName === "mastra_workspace_execute_command") {
		const command = String(args.command ?? args.cmd ?? "");
		const stdout = result.stdout != null ? String(result.stdout) : undefined;
		const stderr = result.stderr != null ? String(result.stderr) : undefined;
		const exitCode =
			result.exitCode != null ? Number(result.exitCode) : undefined;
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
	if (part.toolName === "mastra_workspace_write_file") {
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
	if (part.toolName === "mastra_workspace_edit_file") {
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
	if (part.toolName === "web_search") {
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
	if (part.toolName === "web_fetch") {
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
	if (part.toolName === "ask_user_question") {
		const questions = Array.isArray(args.questions) ? args.questions : [];

		if (part.status === "done" && part.result != null) {
			const answers = result.answers as Record<string, string> | undefined;
			return (
				<ToolCall
					icon={MessageCircleQuestionIcon}
					isError={false}
					isPending={false}
					title={
						answers
							? `Answered ${Object.keys(answers).length} question(s)`
							: "Question skipped"
					}
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

	// --- Read-only exploration tools → compact ToolCall ---
	if (READ_ONLY_TOOLS.has(part.toolName)) {
		return <ReadOnlyToolCall part={part} />;
	}

	// --- Destructive workspace tools → compact ToolCall ---
	if (part.toolName === "mastra_workspace_mkdir") {
		const isPending = part.status !== "done";
		const subtitle = String(args.path ?? "");
		const shortName = subtitle.includes("/")
			? (subtitle.split("/").pop() ?? subtitle)
			: subtitle;
		return (
			<ToolCall
				icon={FolderIcon}
				title={isPending ? "Creating directory" : "Created directory"}
				subtitle={shortName}
				isPending={isPending}
				isError={!!part.isError}
			/>
		);
	}

	if (part.toolName === "mastra_workspace_delete") {
		const isPending = part.status !== "done";
		const subtitle = String(args.path ?? "");
		const shortName = subtitle.includes("/")
			? (subtitle.split("/").pop() ?? subtitle)
			: subtitle;
		return (
			<ToolCall
				icon={FileIcon}
				title={isPending ? "Deleting" : "Deleted"}
				subtitle={shortName}
				isPending={isPending}
				isError={!!part.isError}
			/>
		);
	}

	// --- Fallback: generic tool UI ---
	return (
		<Tool>
			<ToolHeader title={part.toolName} state={toToolDisplayState(part)} />
			<ToolContent>
				{part.args != null && <ToolInput input={part.args} />}
				{(part.result != null || part.isError) && (
					<ToolOutput
						output={part.isError ? undefined : part.result}
						errorText={
							part.isError
								? typeof part.result === "string"
									? part.result
									: JSON.stringify(part.result)
								: undefined
						}
					/>
				)}
			</ToolContent>
		</Tool>
	);
}
