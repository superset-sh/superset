import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { getToolName } from "ai";
import {
	AppWindowIcon,
	BotIcon,
	FileIcon,
	FolderIcon,
	FolderKanbanIcon,
	FolderPlusIcon,
	FolderTreeIcon,
	InfoIcon,
	MonitorSmartphoneIcon,
	PencilLineIcon,
	Trash2Icon,
} from "lucide-react";
import type { ComponentType } from "react";
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
import { AskUserQuestionToolCall } from "./components/AskUserQuestionToolCall";
import { CreateTaskToolCall } from "./components/CreateTaskToolCall";
import { DeleteTaskToolCall } from "./components/DeleteTaskToolCall";
import { EditToolExpandedDiff } from "./components/EditToolExpandedDiff";
import { GenericToolCall } from "./components/GenericToolCall";
import { GetTaskToolCall } from "./components/GetTaskToolCall";
import { ListMembersToolCall } from "./components/ListMembersToolCall";
import { ListTaskStatusesToolCall } from "./components/ListTaskStatusesToolCall";
import { ListTasksToolCall } from "./components/ListTasksToolCall";
import { SubagentToolCall } from "./components/SubagentToolCall";
import { SupersetToolCall } from "./components/SupersetToolCall";
import { SwitchWorkspaceToolCall } from "./components/SwitchWorkspaceToolCall";
import { UpdateTaskToolCall } from "./components/UpdateTaskToolCall";
import { getExecuteCommandViewModel } from "./utils/getExecuteCommandViewModel";
import { getWebSearchViewModel } from "./utils/getWebSearchViewModel";

interface ToolCallBlockProps {
	part: ToolPart;
	workspaceId?: string;
	workspaceCwd?: string;
	sessionId?: string | null;
	organizationId?: string | null;
	onAnswer?: (
		toolCallId: string,
		answers: Record<string, string>,
	) => Promise<void> | void;
}

interface DiffPaneTarget {
	diffCategory: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
}

const SIMPLE_SUPERSET_TOOL_CALLS: Record<
	string,
	{
		icon: ComponentType<{ className?: string }>;
		toolName: string;
	}
> = {
	list_devices: {
		icon: MonitorSmartphoneIcon,
		toolName: "List devices",
	},
	list_workspaces: {
		icon: FolderTreeIcon,
		toolName: "List workspaces",
	},
	list_projects: {
		icon: FolderKanbanIcon,
		toolName: "List projects",
	},
	get_app_context: {
		icon: AppWindowIcon,
		toolName: "Get app context",
	},
	get_workspace_details: {
		icon: InfoIcon,
		toolName: "Get workspace details",
	},
	create_workspace: {
		icon: FolderPlusIcon,
		toolName: "Create workspace",
	},
	update_workspace: {
		icon: PencilLineIcon,
		toolName: "Update workspace",
	},
	delete_workspace: {
		icon: Trash2Icon,
		toolName: "Delete workspace",
	},
	start_agent_session: {
		icon: BotIcon,
		toolName: "Start agent session",
	},
	start_agent_session_with_prompt: {
		icon: BotIcon,
		toolName: "Start agent session with prompt",
	},
};

export function ToolCallBlock({
	part,
	workspaceId,
	workspaceCwd,
	sessionId,
	organizationId,
	onAnswer,
}: ToolCallBlockProps) {
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
		return (
			<AskUserQuestionToolCall
				part={part}
				args={args}
				result={result}
				outputObject={outputObject}
				nestedResultObject={nestedResultObject}
				onAnswer={onAnswer}
			/>
		);
	}

	// --- Superset MCP tools ---
	if (toolName === "create_task") {
		return <CreateTaskToolCall part={part} />;
	}

	if (toolName === "update_task") {
		return <UpdateTaskToolCall part={part} />;
	}

	if (toolName === "list_tasks") {
		return <ListTasksToolCall part={part} />;
	}

	if (toolName === "get_task") {
		return <GetTaskToolCall part={part} />;
	}

	if (toolName === "delete_task") {
		return <DeleteTaskToolCall part={part} />;
	}

	if (toolName === "list_task_statuses") {
		return <ListTaskStatusesToolCall part={part} />;
	}

	if (toolName === "list_members") {
		return <ListMembersToolCall part={part} />;
	}

	if (toolName === "switch_workspace") {
		return <SwitchWorkspaceToolCall part={part} />;
	}

	const simpleSupersetToolCall = SIMPLE_SUPERSET_TOOL_CALLS[toolName];
	if (simpleSupersetToolCall) {
		return (
			<SupersetToolCall
				part={part}
				icon={simpleSupersetToolCall.icon}
				toolName={simpleSupersetToolCall.toolName}
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
			<SupersetToolCall
				part={part}
				toolName="Create directory"
				icon={FolderIcon}
			/>
		);
	}

	if (toolName === "mastra_workspace_delete") {
		return (
			<SupersetToolCall part={part} toolName="Delete path" icon={FileIcon} />
		);
	}

	if (toolName === "request_sandbox_access") {
		return <SupersetToolCall part={part} toolName="Request sandbox access" />;
	}

	if (toolName === "task_write") {
		return <SupersetToolCall part={part} toolName="Write task list" />;
	}

	if (toolName === "task_check") {
		return <SupersetToolCall part={part} toolName="Update task status" />;
	}

	if (toolName === "submit_plan") {
		return <SupersetToolCall part={part} toolName="Submit plan" />;
	}

	if (toolName === "subagent") {
		return <SubagentToolCall part={part} args={args} result={result} />;
	}

	// --- Fallback: generic tool UI ---
	return <GenericToolCall part={part} toolName={toolDisplayName} />;
}
