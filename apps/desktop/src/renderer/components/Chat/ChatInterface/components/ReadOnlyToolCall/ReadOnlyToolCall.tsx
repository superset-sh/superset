import { CodeBlock } from "@superset/ui/ai-elements/code-block";
import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import type { BundledLanguage } from "shiki";
import { getToolName } from "ai";
import {
	ExternalLinkIcon,
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
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

function getLanguageFromPath(filePath: string): BundledLanguage {
	const ext = filePath.split(".").pop()?.toLowerCase();
	const languageMap: Partial<Record<string, BundledLanguage>> = {
		ts: "typescript",
		tsx: "tsx",
		js: "javascript",
		jsx: "jsx",
		json: "json",
		md: "markdown",
		mdx: "mdx",
		css: "css",
		html: "html",
		py: "python",
		rb: "ruby",
		rs: "rust",
		go: "go",
		java: "java",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		yaml: "yaml",
		yml: "yaml",
		toml: "toml",
		sql: "sql",
		graphql: "graphql",
		gql: "graphql",
		xml: "xml",
		svg: "xml",
		prisma: "prisma",
		swift: "swift",
		kt: "kotlin",
		cs: "csharp",
		cpp: "cpp",
		c: "c",
		php: "php",
	};
	return (ext && languageMap[ext]) ?? "plaintext";
}

function stripReadToolMetadata(content: string): string {
	const lines = content.split("\n");
	let startIdx = 0;

	// Skip header line like "filename.ext (8111 bytes)"
	if (lines.length > 0 && /^.+\s+\(\d+\s+bytes\)$/.test(lines[0])) {
		startIdx = 1;
	}

	const contentLines = lines.slice(startIdx);

	// Strip "N→" line number prefixes if present
	const lineNumberPattern = /^\d+→/;
	if (contentLines.some((line) => lineNumberPattern.test(line))) {
		return contentLines.map((line) => line.replace(lineNumberPattern, "")).join("\n");
	}

	return contentLines.join("\n");
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
				isReadFileTool && !isError && readFileContent ? (
					<CodeBlock
						className="max-h-[300px] overflow-x-auto overflow-y-auto"
						code={stripReadToolMetadata(readFileContent)}
						language={getLanguageFromPath(
							String(
								args.path ??
									args.filePath ??
									args.file_path ??
									args.file ??
									"",
							),
						)}
						showLineNumbers
					/>
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
