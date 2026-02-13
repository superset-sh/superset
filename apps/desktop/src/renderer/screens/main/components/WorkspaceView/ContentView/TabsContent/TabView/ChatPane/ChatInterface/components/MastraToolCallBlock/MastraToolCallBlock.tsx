import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import { READ_ONLY_TOOLS } from "../../constants";
import type { ToolCallPart } from "../../types";
import {
	getArgs,
	getResult,
	toToolDisplayState,
	toWsToolState,
} from "../../utils/tool-helpers";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";

export function MastraToolCallBlock({ part }: { part: ToolCallPart }) {
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

	// --- Read-only exploration tools → compact ToolCall ---
	if (READ_ONLY_TOOLS.has(part.toolName)) {
		return <ReadOnlyToolCall part={part} />;
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
