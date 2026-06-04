import { ClickableFilePath } from "@superset/ui/ai-elements/clickable-file-path";
import { ReadFileTool } from "@superset/ui/ai-elements/read-file-tool";
import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { getToolName } from "ai";
import {
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { detectLanguage } from "shared/detect-language";
import type { BundledLanguage } from "shiki";
import {
	getWorkspaceToolFilePath,
	normalizeWorkspaceFilePath,
} from "../../utils/file-paths";
import type { ToolPart } from "../../utils/tool-helpers";
import {
	getArgs,
	normalizeToolName,
	toToolDisplayState,
} from "../../utils/tool-helpers";

function stringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

interface ReadOnlyToolCallProps {
	part: ToolPart;
	workspaceId?: string;
	workspaceCwd?: string;
	onOpenFileInPane?: (filePath: string) => void;
}

export function ReadOnlyToolCall({
	part,
	workspaceId,
	workspaceCwd,
	onOpenFileInPane,
}: ReadOnlyToolCallProps) {
	const args = getArgs(part);
	const toolName = normalizeToolName(getToolName(part));
	const output =
		"output" in part ? (part as { output?: unknown }).output : undefined;
	const outputError =
		output != null && typeof output === "object"
			? (output as Record<string, unknown>).error
			: undefined;
	const isError = part.state === "output-error" || outputError !== undefined;
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const displayState = toToolDisplayState(part);
	const isReadFileTool = toolName === "mastra_workspace_read_file";
	const hasDetails = part.input != null || output != null || isError;

	const rawFilePath = isReadFileTool
		? String(args.path ?? args.filePath ?? args.file_path ?? args.file ?? "")
		: "";
	const absoluteFilePath = rawFilePath
		? normalizeWorkspaceFilePath({
				filePath: rawFilePath,
				workspaceRoot: workspaceCwd,
			})
		: null;

	const fileQuery = electronTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath: absoluteFilePath ?? "",
			encoding: "utf-8",
		},
		{
			enabled:
				isReadFileTool && !isPending && !!absoluteFilePath && !!workspaceId,
			retry: false,
			refetchOnWindowFocus: false,
			staleTime: Infinity,
		},
	);

	const fileContent = fileQuery.data?.content as string | undefined;
	const hasFileContent = fileContent !== undefined;

	const lineRange = hasFileContent
		? (() => {
				// The disk read always returns the whole file, so report 1–N
				const lineCount = fileContent.trimEnd().split("\n").length;
				return `1–${lineCount}`;
			})()
		: null;

	let title = "Read file";
	let subtitle = String(args.path ?? args.filePath ?? args.query ?? "");
	let Icon = FileIcon;

	switch (toolName) {
		case "mastra_workspace_read_file":
			title = isPending ? "Reading" : "Read";
			subtitle = String(
				args.path ?? args.filePath ?? args.file_path ?? args.file ?? "",
			);
			Icon = FileIcon;
			break;
		case "mastra_workspace_list_files":
			title = isPending ? "Listing files" : "Listed files";
			subtitle = String(
				args.path ??
					args.directory ??
					args.directoryPath ??
					args.directory_path ??
					args.root ??
					args.cwd ??
					"",
			);
			Icon = FolderTreeIcon;
			break;
		case "mastra_workspace_file_stat":
			title = "Check file";
			subtitle = String(args.path ?? args.file_path ?? args.file ?? "");
			Icon = FileSearchIcon;
			break;
		case "mastra_workspace_search":
			title = "Search";
			subtitle = String(
				args.query ??
					args.pattern ??
					args.regex ??
					args.substring_pattern ??
					args.text ??
					"",
			);
			Icon = SearchIcon;
			break;
		case "mastra_workspace_index":
			title = "Index";
			Icon = SearchIcon;
			break;
	}

	// Show just the filename for paths
	if (subtitle.includes("/")) {
		subtitle = subtitle.split("/").pop() ?? subtitle;
	}

	const filePath = getWorkspaceToolFilePath({ toolName, args });
	const canOpenFile = Boolean(filePath && onOpenFileInPane);

	// Prevent a flash of raw output while the disk read is in flight
	if (
		isReadFileTool &&
		!isError &&
		!isPending &&
		!hasFileContent &&
		fileQuery.isLoading
	) {
		return (
			<ToolCallRow
				icon={Icon}
				isPending
				title="Reading"
				description={subtitle}
			/>
		);
	}

	if (isReadFileTool && !isError && hasFileContent) {
		const displayPath = absoluteFilePath ?? rawFilePath;
		const filename = displayPath.split("/").pop() ?? displayPath;
		return (
			<ReadFileTool
				filename={filename}
				content={fileContent}
				lineRange={lineRange ?? undefined}
				language={detectLanguage(displayPath) as BundledLanguage}
				isError={isError}
				isPending={isPending}
				onOpenInPane={
					canOpenFile && filePath
						? () => onOpenFileInPane?.(filePath)
						: undefined
				}
			/>
		);
	}

	// For file-path tools (e.g. file_stat), make the filename clickable.
	// Search queries and directory listings stay as plain text.
	const descriptionNode =
		canOpenFile && filePath && subtitle ? (
			<ClickableFilePath
				path={filePath}
				display={subtitle}
				onOpen={() => onOpenFileInPane?.(filePath)}
			/>
		) : (
			subtitle || undefined
		);

	return (
		<ToolCallRow
			description={descriptionNode}
			icon={Icon}
			isError={isError || displayState === "output-error"}
			isPending={isPending}
			title={title}
		>
			{hasDetails ? (
				<div className="space-y-2 pl-2">
					{part.input != null && <ToolInput input={part.input} />}
					{(output != null || isError) && (
						<ToolOutput
							output={!isError ? output : undefined}
							errorText={isError ? stringify(outputError ?? output) : undefined}
						/>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
