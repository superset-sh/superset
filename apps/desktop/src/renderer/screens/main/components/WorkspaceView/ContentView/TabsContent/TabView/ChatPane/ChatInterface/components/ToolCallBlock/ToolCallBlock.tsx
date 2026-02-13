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
import { ToolCall } from "@superset/ui/ai-elements/tool-call";
import { UserQuestionTool } from "@superset/ui/ai-elements/user-question-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { MessageCircleQuestionIcon } from "lucide-react";
import {
	mapApproval,
	mapToolCallState,
	safeParseJson,
} from "../../utils/map-tool-state";
import { getToolMeta, getToolStatus } from "../../utils/tool-registry";

interface ToolCallBlockProps {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
	onApprove?: (approvalId: string) => void;
	onDeny?: (approvalId: string) => void;
	onAnswer?: (toolUseId: string, answers: Record<string, string>) => void;
}

type SpecializedToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

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

function WebSearchToolBlock({
	toolCallPart,
	toolResultPart,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
}) {
	const state = toSpecializedState(toolCallPart, toolResultPart);
	const args = safeParseJson(toolCallPart.arguments);
	const query = typeof args.query === "string" ? args.query : undefined;

	const resultContent = toolResultPart?.content
		? safeParseJson(toolResultPart.content)
		: {};
	const results = Array.isArray(resultContent.results)
		? (resultContent.results as Array<{ title?: string; url?: string }>).filter(
				(r): r is { title: string; url: string } =>
					typeof r.title === "string" && typeof r.url === "string",
			)
		: [];

	return <WebSearchTool query={query} results={results} state={state} />;
}

function WebFetchToolBlock({
	toolCallPart,
	toolResultPart,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
}) {
	const state = toSpecializedState(toolCallPart, toolResultPart);
	const args = safeParseJson(toolCallPart.arguments);
	const url = typeof args.url === "string" ? args.url : undefined;

	const resultContent = toolResultPart?.content
		? safeParseJson(toolResultPart.content)
		: {};
	const content =
		typeof resultContent.content === "string"
			? resultContent.content
			: typeof toolResultPart?.content === "string"
				? toolResultPart.content
				: undefined;
	const bytes =
		typeof resultContent.bytes === "number" ? resultContent.bytes : undefined;
	const statusCode =
		typeof resultContent.status_code === "number"
			? resultContent.status_code
			: undefined;

	return (
		<WebFetchTool
			bytes={bytes}
			content={content}
			state={state}
			statusCode={statusCode}
			url={url}
		/>
	);
}

function UserQuestionToolBlock({
	toolCallPart,
	toolResultPart,
	onAnswer,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
	onAnswer?: (toolUseId: string, answers: Record<string, string>) => void;
}) {
	const args = safeParseJson(toolCallPart.arguments);
	const questions = Array.isArray(args.questions) ? args.questions : [];
	if (toolResultPart) {
		const resultContent = toolResultPart?.content
			? safeParseJson(toolResultPart.content)
			: {};
		const answers = resultContent.answers as Record<string, string> | undefined;
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
			onAnswer={(answers) => onAnswer?.(toolCallPart.id, answers)}
			onSkip={() => onAnswer?.(toolCallPart.id, {})}
		/>
	);
}

function DefaultToolBlock({
	toolCallPart,
	toolResultPart,
}: {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
}) {
	const meta = getToolMeta(toolCallPart.name);
	const args = safeParseJson(toolCallPart.arguments);
	const resultContent = toolResultPart?.content
		? safeParseJson(toolResultPart.content)
		: {};
	const state = toolResultPart
		? toolResultPart.error
			? "output-error"
			: "output-available"
		: (toolCallPart.state ?? "input-available");
	const { isPending, isError } = getToolStatus(
		state,
		Boolean(toolResultPart),
		Boolean(toolResultPart?.error),
	);

	const title = meta.title(args, resultContent, state);
	const subtitle = meta.subtitle?.(args, resultContent, state);

	return (
		<ToolCall
			icon={meta.icon}
			isError={isError}
			isPending={isPending}
			subtitle={subtitle}
			title={title}
		/>
	);
}

const SPECIALIZED_DISPATCH: Record<string, string> = {
	Bash: "bash",
	FileEdit: "file-edit",
	FileWrite: "file-write",
	Edit: "file-edit",
	Write: "file-write",
	WebSearch: "web-search",
	WebFetch: "web-fetch",
	AskUserQuestion: "user-question",
};

export function ToolCallBlock({
	toolCallPart,
	toolResultPart,
	onApprove,
	onDeny,
	onAnswer,
}: ToolCallBlockProps) {
	const state = mapToolCallState(toolCallPart, toolResultPart);
	const approval = mapApproval(toolCallPart.approval);
	const dispatch = SPECIALIZED_DISPATCH[toolCallPart.name];

	const toolContent = (() => {
		switch (dispatch) {
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
			case "web-search":
				return (
					<WebSearchToolBlock
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
			case "web-fetch":
				return (
					<WebFetchToolBlock
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
			case "user-question":
				return (
					<UserQuestionToolBlock
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
						onAnswer={onAnswer}
					/>
				);
			default:
				return (
					<DefaultToolBlock
						toolCallPart={toolCallPart}
						toolResultPart={toolResultPart}
					/>
				);
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
