import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { UserQuestionTool } from "@superset/ui/ai-elements/user-question-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { getToolName } from "ai";
import { FileIcon, FolderIcon, MessageCircleQuestionIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { posthog } from "renderer/lib/posthog";
import { useChangesStore } from "renderer/stores/changes";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";
import { READ_ONLY_TOOLS } from "../../constants";
import { normalizeWorkspaceFilePath } from "../../utils/file-paths";
import type { ToolPart } from "../../utils/tool-helpers";
import {
	getArgs,
	getResult,
	normalizeToolName,
	toWsToolState,
} from "../../utils/tool-helpers";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";
import { EditToolExpandedDiff } from "./components/EditToolExpandedDiff";
import { GenericToolCall } from "./components/GenericToolCall";
import { getExecuteCommandViewModel } from "./utils/getExecuteCommandViewModel";
import { getWebSearchViewModel } from "./utils/getWebSearchViewModel";

interface MastraToolCallBlockProps {
	part: ToolPart;
	workspaceId?: string;
	workspaceCwd?: string;
	sessionId?: string | null;
	organizationId?: string | null;
	onAnswer?: (toolCallId: string, answers: Record<string, string>) => void;
}

interface DiffPaneTarget {
	diffCategory: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
}

export function MastraToolCallBlock({
	part,
	workspaceId,
	workspaceCwd,
	sessionId,
	organizationId,
	onAnswer,
}: MastraToolCallBlockProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const state = toWsToolState(part);
	const toolName = normalizeToolName(getToolName(part));
	const hideUnchangedRegions = useChangesStore(
		(store) => store.hideUnchangedRegions,
	);
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const panes = useTabsStore((store) => store.panes);
	const tabs = useTabsStore((store) => store.tabs);
	const toolDisplayName = toolName
		.replace("mastra_workspace_", "")
		.replaceAll("_", " ");
	const normalizeFilePath = useCallback(
		(filePath: string) => {
			const normalizedPath = normalizeWorkspaceFilePath({
				filePath,
				workspaceRoot: workspaceCwd,
			});
			return normalizedPath ?? null;
		},
		[workspaceCwd],
	);
	const openFileInPane = useCallback(
		(filePath: string) => {
			if (!workspaceId) return;
			const normalizedPath = normalizeFilePath(filePath);
			if (!normalizedPath) return;
			addFileViewerPane(workspaceId, { filePath: normalizedPath });
			posthog.capture("chat_file_opened_from_tool", {
				workspace_id: workspaceId,
				session_id: sessionId ?? null,
				organization_id: organizationId ?? null,
				tool_name: toolName,
				open_target: "view",
			});
		},
		[
			addFileViewerPane,
			normalizeFilePath,
			organizationId,
			sessionId,
			toolName,
			workspaceId,
		],
	);
	const workspaceDiffPaneByFilePath = useMemo(() => {
		if (!workspaceId) return new Map<string, DiffPaneTarget>();

		const workspaceTabIds = new Set(
			tabs
				.filter((tab) => tab.workspaceId === workspaceId)
				.map((tab) => tab.id),
		);
		const diffPaneByFilePath = new Map<string, DiffPaneTarget>();

		for (const pane of Object.values(panes)) {
			if (pane?.type !== "file-viewer") continue;
			if (!workspaceTabIds.has(pane.tabId)) continue;

			const fileViewer = pane.fileViewer;
			if (!fileViewer?.filePath || !fileViewer.diffCategory) continue;
			if (diffPaneByFilePath.has(fileViewer.filePath)) continue;

			diffPaneByFilePath.set(fileViewer.filePath, {
				diffCategory: fileViewer.diffCategory,
				commitHash: fileViewer.commitHash,
				oldPath: fileViewer.oldPath,
			});
		}

		return diffPaneByFilePath;
	}, [panes, tabs, workspaceId]);
	const getDiffPaneTargetForFile = useCallback(
		(filePath: string) => {
			const normalizedPath = normalizeFilePath(filePath);
			if (!normalizedPath) return null;
			return workspaceDiffPaneByFilePath.get(normalizedPath) ?? null;
		},
		[normalizeFilePath, workspaceDiffPaneByFilePath],
	);
	const openFileInDiffPane = useCallback(
		(filePath: string) => {
			if (!workspaceId) return;
			const normalizedPath = normalizeFilePath(filePath);
			const diffPaneTarget = getDiffPaneTargetForFile(filePath);
			if (!normalizedPath) return;

			addFileViewerPane(workspaceId, {
				filePath: normalizedPath,
				diffCategory: diffPaneTarget?.diffCategory ?? "unstaged",
				commitHash: diffPaneTarget?.commitHash,
				oldPath: diffPaneTarget?.oldPath,
				viewMode: "diff",
			});
			posthog.capture("chat_file_opened_from_tool", {
				workspace_id: workspaceId,
				session_id: sessionId ?? null,
				organization_id: organizationId ?? null,
				tool_name: toolName,
				open_target: "diff",
			});
		},
		[
			addFileViewerPane,
			getDiffPaneTargetForFile,
			normalizeFilePath,
			organizationId,
			sessionId,
			toolName,
			workspaceId,
		],
	);

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
				.map((item) => toText(item))
				.filter((item): item is string =>
					Boolean(item && item.trim().length > 0),
				);
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

	const toRecord = (value: unknown): Record<string, unknown> | undefined => {
		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
		return undefined;
	};

	const getFilePath = (...values: unknown[]): string => {
		return firstText(...values) ?? "";
	};

	const deriveStringsFromStructuredPatch = (
		hunks?: Array<{ lines: string[] }>,
	): { oldString: string; newString: string } | undefined => {
		if (!hunks?.length) return undefined;

		const oldLines: string[] = [];
		const newLines: string[] = [];

		for (const hunk of hunks) {
			for (const rawLine of hunk.lines) {
				if (
					rawLine.startsWith("@@") ||
					rawLine.startsWith("\\ No newline at end of file")
				) {
					continue;
				}

				if (rawLine.startsWith("+")) {
					newLines.push(rawLine.slice(1));
					continue;
				}

				if (rawLine.startsWith("-")) {
					oldLines.push(rawLine.slice(1));
					continue;
				}

				const line = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
				oldLines.push(line);
				newLines.push(line);
			}
		}

		if (oldLines.length === 0 && newLines.length === 0) return undefined;

		return {
			oldString: oldLines.join("\n"),
			newString: newLines.join("\n"),
		};
	};

	// --- Execute command → BashTool ---
	if (toolName === "mastra_workspace_execute_command") {
		const { command, stdout, stderr, exitCode } = getExecuteCommandViewModel({
			args,
			result,
		});
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
		const filePath = getFilePath(
			args.path,
			args.filePath,
			args.file_path,
			args.relative_workspace_path,
			args.relativePath,
			args.file,
			args.filename,
			toRecord(args.target)?.path,
		);
		const content = String(args.content ?? args.data ?? "");
		return (
			<FileDiffTool
				filePath={filePath}
				content={content}
				isWriteMode
				onFilePathClick={openFileInDiffPane}
				renderExpandedContent={
					content
						? () => (
								<EditToolExpandedDiff
									filePath={filePath}
									oldString=""
									newString={content}
									hideUnchangedRegions={hideUnchangedRegions}
								/>
							)
						: undefined
				}
				state={state}
			/>
		);
	}

	// --- Edit file → FileDiffTool (diff mode) ---
	if (
		toolName === "mastra_workspace_edit_file" ||
		toolName === "ast_smart_edit"
	) {
		const editArgs = toRecord(args.edit);
		const filePath = getFilePath(
			args.path,
			args.filePath,
			args.file_path,
			args.relative_workspace_path,
			args.relativePath,
			args.file,
			args.filename,
			args.file_name,
			args.target_file,
			args.target_path,
			args.targetPath,
			editArgs?.path,
			editArgs?.filePath,
			editArgs?.file_path,
			toRecord(args.target)?.path,
		);
		const oldString =
			firstText(
				args.oldString,
				args.old_string,
				args.old_str,
				args.oldText,
				args.old_text,
				args.oldCode,
				args.old_code,
				args.before,
				args.find,
				args.search,
				args.original,
				args.previous,
				args.from,
				editArgs?.oldString,
				editArgs?.old_string,
				editArgs?.oldText,
				editArgs?.before,
				outputObject?.oldString,
				outputObject?.old_string,
				nestedResultObject?.oldString,
				nestedResultObject?.old_string,
			) ?? "";
		const newString =
			firstText(
				args.newString,
				args.new_string,
				args.new_str,
				args.newText,
				args.new_text,
				args.newCode,
				args.new_code,
				args.after,
				args.replace,
				args.replacement,
				args.updated,
				args.to,
				editArgs?.newString,
				editArgs?.new_string,
				editArgs?.newText,
				editArgs?.after,
				outputObject?.newString,
				outputObject?.new_string,
				nestedResultObject?.newString,
				nestedResultObject?.new_string,
			) ?? "";

		const structuredPatchValue =
			(Array.isArray(result.structuredPatch)
				? result.structuredPatch
				: Array.isArray(outputObject?.structuredPatch)
					? outputObject?.structuredPatch
					: Array.isArray(nestedResultObject?.structuredPatch)
						? nestedResultObject?.structuredPatch
						: undefined) ??
			(Array.isArray(result.structured_patch)
				? result.structured_patch
				: Array.isArray(outputObject?.structured_patch)
					? outputObject?.structured_patch
					: Array.isArray(nestedResultObject?.structured_patch)
						? nestedResultObject?.structured_patch
						: undefined);
		const structuredPatch = structuredPatchValue?.filter(
			(hunk): hunk is { lines: string[] } => {
				return Boolean(
					typeof hunk === "object" &&
						hunk !== null &&
						Array.isArray((hunk as { lines?: unknown }).lines),
				);
			},
		);
		const derivedStrings = deriveStringsFromStructuredPatch(structuredPatch);
		const expandedOldString = oldString || derivedStrings?.oldString || "";
		const expandedNewString = newString || derivedStrings?.newString || "";

		return (
			<FileDiffTool
				filePath={filePath}
				oldString={oldString}
				newString={newString}
				structuredPatch={structuredPatch}
				onFilePathClick={openFileInDiffPane}
				renderExpandedContent={
					expandedOldString || expandedNewString
						? () => (
								<EditToolExpandedDiff
									filePath={filePath}
									oldString={expandedOldString}
									newString={expandedNewString}
									hideUnchangedRegions={hideUnchangedRegions}
								/>
							)
						: undefined
				}
				state={state}
			/>
		);
	}

	// --- Web search → WebSearchTool ---
	if (toolName === "web_search") {
		const { query, results } = getWebSearchViewModel({ args, result });
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
		return <ReadOnlyToolCall part={part} onOpenFileInPane={openFileInPane} />;
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

	if (toolName === "request_sandbox_access") {
		return <GenericToolCall part={part} toolName="Request sandbox access" />;
	}

	if (toolName === "task_write") {
		return <GenericToolCall part={part} toolName="Write task list" />;
	}

	if (toolName === "task_check") {
		return <GenericToolCall part={part} toolName="Update task status" />;
	}

	if (toolName === "submit_plan") {
		return <GenericToolCall part={part} toolName="Submit plan" />;
	}

	// --- Fallback: generic tool UI ---
	return <GenericToolCall part={part} toolName={toolDisplayName} />;
}
