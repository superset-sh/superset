import type {
	ToolCallPart,
	ToolResultPart,
} from "@superset/durable-session/react";
import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import {
	Confirmation,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@superset/ui/ai-elements/confirmation";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import {
	mapApproval,
	mapToolCallState,
	safeParseJson,
} from "../../utils/map-tool-state";

interface ToolCallBlockProps {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
	onApprove?: (approvalId: string) => void;
	onDeny?: (approvalId: string) => void;
}

type SpecializedToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

/**
 * Map the broader ToolDisplayState to the 4-state subset
 * used by BashTool and FileDiffTool.
 */
function toSpecializedState(
	tc: ToolCallPart,
	result?: ToolResultPart,
): SpecializedToolState {
	if (result) {
		return result.error ? "output-error" : "output-available";
	}
	switch (tc.state) {
		case "input-streaming":
		case "awaiting-input":
			return "input-streaming";
		case "approval-requested":
		case "approval-responded":
			return tc.output != null ? "output-available" : "input-available";
		default:
			return "input-available";
	}
}

function BashToolBlock({
	toolCallPart,
	toolResultPart,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
}) {
	const state = toSpecializedState(toolCallPart, toolResultPart);
	const args = safeParseJson(toolCallPart.arguments);
	const command = typeof args.command === "string" ? args.command : undefined;

	// Parse result content for stdout/stderr
	const resultContent = toolResultPart?.content
		? safeParseJson(toolResultPart.content)
		: {};
	const stdout =
		typeof resultContent.stdout === "string"
			? resultContent.stdout
			: typeof toolResultPart?.content === "string" &&
					!toolResultPart.content.startsWith("{")
				? toolResultPart.content
				: undefined;
	const stderr =
		typeof resultContent.stderr === "string" ? resultContent.stderr : undefined;
	const exitCode =
		typeof resultContent.exit_code === "number"
			? resultContent.exit_code
			: undefined;

	return (
		<BashTool
			command={command}
			exitCode={exitCode}
			state={state}
			stderr={stderr}
			stdout={stdout}
		/>
	);
}

function FileDiffToolBlock({
	toolCallPart,
	toolResultPart,
	isWriteMode,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
	isWriteMode: boolean;
}) {
	const state = toSpecializedState(toolCallPart, toolResultPart);
	const args = safeParseJson(toolCallPart.arguments);
	const filePath =
		typeof args.file_path === "string" ? args.file_path : undefined;

	// Parse result for structured patch
	const resultContent = toolResultPart?.content
		? safeParseJson(toolResultPart.content)
		: {};
	const structuredPatch = Array.isArray(resultContent.structured_patch)
		? resultContent.structured_patch
		: undefined;

	if (isWriteMode) {
		const content = typeof args.content === "string" ? args.content : undefined;
		return (
			<FileDiffTool
				content={content}
				filePath={filePath}
				isWriteMode
				state={state}
				structuredPatch={structuredPatch}
			/>
		);
	}

	const oldString =
		typeof args.old_string === "string" ? args.old_string : undefined;
	const newString =
		typeof args.new_string === "string" ? args.new_string : undefined;

	return (
		<FileDiffTool
			filePath={filePath}
			newString={newString}
			oldString={oldString}
			state={state}
			structuredPatch={structuredPatch}
		/>
	);
}

/** Tool names that get specialized rendering. */
const SPECIALIZED_TOOLS: Record<string, "bash" | "file-edit" | "file-write"> = {
	Bash: "bash",
	FileEdit: "file-edit",
	FileWrite: "file-write",
};

export function ToolCallBlock({
	toolCallPart,
	toolResultPart,
	onApprove,
	onDeny,
}: ToolCallBlockProps) {
	const state = mapToolCallState(toolCallPart, toolResultPart);
	const approval = mapApproval(toolCallPart.approval);
	const specialized = SPECIALIZED_TOOLS[toolCallPart.name];

	const toolContent = (() => {
		switch (specialized) {
			case "bash":
				return (
					<BashToolBlock
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
			case "file-edit":
				return (
					<FileDiffToolBlock
						isWriteMode={false}
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
			case "file-write":
				return (
					<FileDiffToolBlock
						isWriteMode
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
			default: {
				const output = toolResultPart?.content ?? toolCallPart.output;
				const errorText = toolResultPart?.error;
				return (
					<Tool defaultOpen={state === "output-error"}>
						<ToolHeader
							title={toolCallPart.name}
							type={toolCallPart.type}
							state={state}
						/>
						<ToolContent>
							<ToolInput input={toolCallPart.arguments} />
							{(output || errorText) && (
								<ToolOutput output={output} errorText={errorText} />
							)}
						</ToolContent>
					</Tool>
				);
			}
		}
	})();

	return (
		<div className="flex flex-col gap-2">
			{toolContent}

			{approval && (
				<Confirmation approval={approval} state={state}>
					<ConfirmationTitle>
						{"approved" in approval
							? approval.approved
								? `${toolCallPart.name} was approved`
								: `${toolCallPart.name} was denied`
							: `Allow ${toolCallPart.name}?`}
					</ConfirmationTitle>
					<ConfirmationRequest>
						<ConfirmationActions>
							<ConfirmationAction
								variant="outline"
								onClick={() => onDeny?.(approval.id)}
							>
								Deny
							</ConfirmationAction>
							<ConfirmationAction onClick={() => onApprove?.(approval.id)}>
								Allow
							</ConfirmationAction>
						</ConfirmationActions>
					</ConfirmationRequest>
				</Confirmation>
			)}
		</div>
	);
}
