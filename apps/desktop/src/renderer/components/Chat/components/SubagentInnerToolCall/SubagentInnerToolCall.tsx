import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { ClickableFilePath } from "@superset/ui/ai-elements/clickable-file-path";
import { ReadFileTool } from "@superset/ui/ai-elements/read-file-tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import {
	CodeIcon,
	FileIcon,
	FileSearchIcon,
	FileTextIcon,
	FolderIcon,
	GlobeIcon,
	SearchIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import { type ComponentType, useMemo } from "react";
import { getExecuteCommandViewModel } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock/utils/getExecuteCommandViewModel";
import { normalizeWorkspaceFilePath } from "renderer/components/Chat/ChatInterface/utils/file-paths";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { detectLanguage } from "shared/detect-language";
import type { BundledLanguage } from "shiki";

interface SubagentInnerToolCallProps {
	name: string;
	isError: boolean;
	isPending?: boolean;
	args: Record<string, unknown> | null;
	result: string | null;
	workspaceId?: string;
	workspaceCwd?: string;
	onOpenFileInPane?: (filePath: string) => void;
}

interface ToolMeta {
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const TOOL_META: Record<string, ToolMeta> = {
	mastra_workspace_execute_command: {
		label: "Bash",
		icon: TerminalIcon,
	},
	mastra_workspace_write_file: { label: "Write", icon: FileIcon },
	mastra_workspace_edit_file: { label: "Edit", icon: FileTextIcon },
	mastra_workspace_read_file: { label: "Read", icon: FileIcon },
	mastra_workspace_list_files: { label: "List Files", icon: FolderIcon },
	mastra_workspace_file_stat: { label: "Check file", icon: FileSearchIcon },
	mastra_workspace_search: { label: "Search", icon: SearchIcon },
	mastra_workspace_mkdir: { label: "Create Directory", icon: FolderIcon },
	mastra_workspace_delete: { label: "Delete", icon: FileIcon },
	ast_smart_edit: { label: "Smart Edit", icon: CodeIcon },
	web_fetch: { label: "Web Fetch", icon: GlobeIcon },
	web_search: { label: "Web Search", icon: GlobeIcon },
};

function getToolMeta(toolName: string): ToolMeta {
	return (
		TOOL_META[toolName] ?? {
			label: toolName.replaceAll("_", " "),
			icon: WrenchIcon,
		}
	);
}

/** Tools where the description is a file path (not a search query or URL). */
const FILE_PATH_TOOLS = new Set([
	"mastra_workspace_write_file",
	"mastra_workspace_edit_file",
	"mastra_workspace_file_stat",
	"mastra_workspace_delete",
	"ast_smart_edit",
]);

function getRawFilePath(
	toolName: string,
	args: Record<string, unknown>,
): string | null {
	if (FILE_PATH_TOOLS.has(toolName)) {
		const raw = String(
			args.path ?? args.filePath ?? args.file_path ?? args.file ?? "",
		);
		return raw || null;
	}
	return null;
}

function getDescription(
	toolName: string,
	args: Record<string, unknown> | null,
): string | undefined {
	if (!args) return undefined;

	let raw: string | undefined;

	switch (toolName) {
		case "mastra_workspace_read_file":
		case "mastra_workspace_write_file":
		case "mastra_workspace_edit_file":
		case "mastra_workspace_file_stat":
		case "mastra_workspace_delete":
		case "ast_smart_edit":
			raw =
				String(
					args.path ?? args.filePath ?? args.file_path ?? args.file ?? "",
				) || undefined;
			break;
		case "mastra_workspace_list_files":
		case "mastra_workspace_mkdir":
			raw =
				String(
					args.path ??
						args.directory ??
						args.directoryPath ??
						args.directory_path ??
						args.root ??
						args.cwd ??
						"",
				) || undefined;
			break;
		case "mastra_workspace_search":
			raw =
				String(
					args.query ??
						args.pattern ??
						args.regex ??
						args.substring_pattern ??
						args.text ??
						"",
				) || undefined;
			break;
		case "web_fetch":
			raw = String(args.url ?? args.uri ?? "") || undefined;
			break;
		case "web_search":
			raw = String(args.query ?? args.q ?? "") || undefined;
			break;
		default:
			return undefined;
	}

	if (!raw) return undefined;

	// For paths, show only the filename
	if (
		raw.includes("/") &&
		toolName !== "mastra_workspace_search" &&
		toolName !== "web_fetch" &&
		toolName !== "web_search"
	) {
		return raw.split("/").pop() ?? raw;
	}

	return raw;
}

/**
 * The Mastra workspace read_file tool returns content in this format:
 *   /path/to/file (N bytes)
 *        1\tline one
 *        2\tline two
 *
 * Strip the header and line-number prefixes to get clean file content.
 */
function parseReadFileResult(result: string): {
	filename: string;
	content: string;
	lineCount: number;
} | null {
	const lines = result.split("\n");
	if (lines.length < 2) return null;

	// First line: "path/to/file (N bytes)" or just content
	const headerMatch = lines[0].match(/^(.+?)\s*\(\d+\s*bytes?\)\s*$/i);
	if (!headerMatch) return null;

	const filename = headerMatch[1].trim();
	const contentLines = lines.slice(1);

	// Strip line-number prefix: "   N\t" or "   N→"
	const stripped = contentLines.map((line) => {
		const tabMatch = line.match(/^\s*\d+\t(.*)$/);
		if (tabMatch) return tabMatch[1];
		const arrowMatch = line.match(/^\s*\d+\u2192(.*)$/);
		if (arrowMatch) return arrowMatch[1];
		return line;
	});

	// Trim trailing blank lines
	while (stripped.length > 0 && stripped[stripped.length - 1].trim() === "") {
		stripped.pop();
	}

	return {
		filename,
		content: stripped.join("\n"),
		lineCount: stripped.length,
	};
}

export function SubagentInnerToolCall({
	name,
	isError,
	isPending = false,
	args,
	result,
	workspaceCwd,
	onOpenFileInPane,
}: SubagentInnerToolCallProps) {
	const normalized = normalizeToolName(name);
	const state = isPending
		? ("input-available" as const)
		: isError
			? ("output-error" as const)
			: ("output-available" as const);

	const { label, icon } = getToolMeta(normalized);
	const description = getDescription(normalized, args);
	const hasResult = result !== null && result.trim().length > 0;

	// Read file: parse and display using the shared ReadFileTool component
	const parsedReadFile = useMemo(() => {
		if (normalized !== "mastra_workspace_read_file") return null;
		if (result === null || result.trim().length === 0) return null;
		return parseReadFileResult(result);
	}, [normalized, result]);

	if (normalized === "mastra_workspace_execute_command") {
		const argsRecord = args ?? {};
		const resultRecord = result !== null ? { content: result } : {};
		const { command, stdout, stderr, exitCode } = getExecuteCommandViewModel({
			args: argsRecord,
			result: resultRecord,
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
	if (
		normalized === "mastra_workspace_read_file" &&
		hasResult &&
		parsedReadFile
	) {
		const parsed = parsedReadFile;
		if (parsed) {
			const filename = parsed.filename.split("/").pop() ?? parsed.filename;
			const lineRange = `1–${parsed.lineCount}`;
			const openInPane = onOpenFileInPane
				? () => {
						const rawPath = String(
							args?.path ??
								args?.filePath ??
								args?.file_path ??
								args?.file ??
								parsed.filename,
						);
						const resolvedPath =
							normalizeWorkspaceFilePath({
								filePath: rawPath,
								workspaceRoot: workspaceCwd,
							}) ?? rawPath;
						onOpenFileInPane(resolvedPath);
					}
				: undefined;
			return (
				<ReadFileTool
					filename={filename}
					content={parsed.content}
					lineRange={lineRange}
					language={detectLanguage(parsed.filename) as BundledLanguage}
					isError={isError}
					isPending={isPending}
					onOpenInPane={openInPane}
				/>
			);
		}
	}

	// For file-path tools, make the filename in the description clickable.
	const rawFilePath = getRawFilePath(normalized, args ?? {});
	const resolvedFilePath = rawFilePath
		? (normalizeWorkspaceFilePath({
				filePath: rawFilePath,
				workspaceRoot: workspaceCwd,
			}) ?? rawFilePath)
		: null;

	const descriptionNode =
		resolvedFilePath && onOpenFileInPane && description ? (
			<ClickableFilePath
				path={resolvedFilePath}
				display={description}
				onOpen={() => onOpenFileInPane(resolvedFilePath)}
			/>
		) : (
			description
		);

	return (
		<ToolCallRow
			icon={icon}
			isError={isError}
			isPending={isPending}
			title={label}
			description={descriptionNode}
		>
			{hasResult ? (
				<div className="pl-2 py-1.5">
					<div className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
						{result}
					</div>
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
