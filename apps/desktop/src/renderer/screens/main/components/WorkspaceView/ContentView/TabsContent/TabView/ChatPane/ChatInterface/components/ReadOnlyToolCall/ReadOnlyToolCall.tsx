import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { getToolName } from "ai";
import {
	CheckIcon,
	ExternalLinkIcon,
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	Loader2Icon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getWorkspaceToolFilePath } from "../../utils/file-paths";
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

function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

function toStringValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return undefined;
}

function extractReadFileContent(output: unknown): string | undefined {
	const direct = toStringValue(output);
	if (direct) return direct;

	const record = toRecord(output);
	if (!record) return undefined;

	const nestedResult = toRecord(record.result);

	return (
		toStringValue(record.content) ??
		toStringValue(record.text) ??
		toStringValue(record.stdout) ??
		toStringValue(record.data) ??
		toStringValue(nestedResult?.content) ??
		toStringValue(nestedResult?.text) ??
		toStringValue(nestedResult?.stdout)
	);
}

interface ReadOnlyToolCallProps {
	part: ToolPart;
	onOpenFileInPane?: (filePath: string) => void;
}

export function ReadOnlyToolCall({
	part,
	onOpenFileInPane,
}: ReadOnlyToolCallProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [hasAutoOpened, setHasAutoOpened] = useState(false);
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
	const readFileContent = isReadFileTool
		? extractReadFileContent(output)
		: undefined;
	const hasDetails = part.input != null || output != null || isError;

	useEffect(() => {
		if (
			!hasAutoOpened &&
			isReadFileTool &&
			Boolean(readFileContent) &&
			!isPending
		) {
			setIsOpen(true);
			setHasAutoOpened(true);
		}
	}, [hasAutoOpened, isPending, isReadFileTool, readFileContent]);

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

	return (
		<Collapsible
			className="overflow-hidden rounded-md"
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<div className="flex items-center">
				<CollapsibleTrigger asChild>
					<button
						className={
							hasDetails
								? "flex h-7 min-w-0 flex-1 items-center justify-between px-2.5 text-left transition-colors duration-150 hover:bg-muted/30"
								: "flex h-7 min-w-0 flex-1 items-center justify-between px-2.5 text-left"
						}
						disabled={!hasDetails}
						type="button"
					>
						<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
							<Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
							<ShimmerLabel
								className="truncate text-xs text-muted-foreground"
								isShimmering={isPending}
							>
								{subtitle ? `${title} ${subtitle}` : title}
							</ShimmerLabel>
						</div>
						<div className="ml-2 flex h-6 w-6 items-center justify-center text-muted-foreground">
							{isPending ? (
								<Loader2Icon className="h-3 w-3 animate-spin" />
							) : isError || displayState === "output-error" ? (
								<XIcon className="h-3 w-3" />
							) : (
								<CheckIcon className="h-3 w-3" />
							)}
						</div>
					</button>
				</CollapsibleTrigger>
				{canOpenFile && filePath && (
					<button
						type="button"
						aria-label={`Open ${filePath} in file pane`}
						className="mr-1 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
						onClick={() => onOpenFileInPane?.(filePath)}
					>
						<ExternalLinkIcon className="h-3 w-3" />
					</button>
				)}
			</div>
			{hasDetails && (
				<CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
					{isReadFileTool && !isError && readFileContent ? (
						<div className="mt-0.5 max-h-[300px] overflow-y-auto">
							<pre className="whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs text-foreground">
								{readFileContent}
							</pre>
						</div>
					) : (
						<div className="mt-0.5">
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
					)}
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
