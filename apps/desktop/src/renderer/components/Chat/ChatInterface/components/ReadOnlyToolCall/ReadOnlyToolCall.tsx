import { CodeBlock } from "@superset/ui/ai-elements/code-block";
import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { getToolName } from "ai";
import {
	ExternalLinkIcon,
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
		? normalizeWorkspaceFilePath({ filePath: rawFilePath, workspaceRoot: workspaceCwd })
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
		},
	);

	const fileContent = fileQuery.data?.content as string | undefined;

	const lineRange = fileContent
		? (() => {
				const startLine =
					Number(
						args.startLine ?? args.start_line ?? args.offset ?? args.from ?? 1,
					) || 1;
				const lineCount = fileContent.split("\n").length;
				const endLine = startLine + lineCount - 1;
				return startLine === 1 && endLine === lineCount
					? `1–${lineCount}`
					: `${startLine}–${endLine}`;
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

	const headerExtra =
		canOpenFile && filePath ? (
			<button
				type="button"
				aria-label={`Open ${filePath} in file pane`}
				className="mr-1 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
				onClick={() => onOpenFileInPane?.(filePath)}
			>
				<ExternalLinkIcon className="h-3 w-3" />
			</button>
		) : undefined;

	return (
		<ToolCallRow
			description={subtitle || undefined}
			headerExtra={headerExtra}
			icon={Icon}
			isError={isError || displayState === "output-error"}
			isPending={isPending}
			title={title}
		>
			{hasDetails ? (
				isReadFileTool && !isError && fileContent ? (
					<div className="pl-2">
						<div className="overflow-hidden rounded-md border border-border">
							<div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
								<span className="text-foreground">
									{(absoluteFilePath ?? rawFilePath).split("/").pop()}
								</span>
								{lineRange && (
									<span className="text-muted-foreground">{lineRange}</span>
								)}
							</div>
							<CodeBlock
								className="rounded-none border-0 [&>div>div]:max-h-[300px] [&_pre]:!p-2"
								code={fileContent}
								colorize={false}
								language={
									detectLanguage(absoluteFilePath ?? rawFilePath) as BundledLanguage
								}
								showLineNumbers
							/>
						</div>
					</div>
				) : (
					<div className="space-y-2 pl-2">
						{part.input != null && <ToolInput input={part.input} />}
						{(output != null || isError) && (
							<ToolOutput
								output={!isError ? output : undefined}
								errorText={
									isError ? stringify(outputError ?? output) : undefined
								}
							/>
						)}
					</div>
				)
			) : undefined}
		</ToolCallRow>
	);
}
