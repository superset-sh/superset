import { FileIcon } from "lucide-react-native";
import { ClickableFilePath } from "./clickable-file-path";
import { ShowCode } from "./show-code";
import { ToolCallRow } from "./tool-call-row";

export type ReadFileToolProps = {
	/** Basename shown in the header (e.g. "ReadOnlyToolCall.tsx"). */
	filename: string;
	/** Parsed, clean file content (no line-number prefixes). */
	content: string;
	/** Line range label shown in the header (e.g. "1–217"). */
	lineRange?: string;
	/** Language for syntax highlighting. Defaults to "text". */
	language?: string;
	isError?: boolean;
	isPending?: boolean;
	/** When provided, makes the filename pressable to open in pane. */
	onOpenInPane?: () => void;
	className?: string;
};

/**
 * Shared read-file tool call display used by both the main agent's
 * ReadOnlyToolCall and the subagent's SubagentInnerToolCall.
 */
export function ReadFileTool({
	filename,
	content,
	lineRange,
	language = "text",
	isError = false,
	isPending = false,
	onOpenInPane,
	className,
}: ReadFileToolProps) {
	return (
		<ToolCallRow
			className={className}
			description={
				<ClickableFilePath
					className="text-muted-foreground text-xs"
					onPress={onOpenInPane ? () => onOpenInPane() : undefined}
					path={filename}
				/>
			}
			icon={FileIcon}
			isError={isError}
			isPending={isPending}
			title="Read"
		>
			<ShowCode
				className="my-1.5 ml-2"
				code={content}
				colorize={false}
				filename={filename}
				language={language}
				lineRange={lineRange}
				onOpen={onOpenInPane}
				showLineNumbers
			/>
		</ToolCallRow>
	);
}
