import { FileSearchIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface LspInspectToolCallProps {
	part: ToolPart;
}

export function LspInspectToolCall({ part }: LspInspectToolCallProps) {
	const args = getArgs(part);
	const rawPath = String(
		args.file_path ?? args.filePath ?? args.path ?? args.file ?? "",
	);
	const fileName = rawPath.includes("/")
		? rawPath.split("/").pop()
		: rawPath || undefined;

	return (
		<SupersetToolCall
			part={part}
			toolName="LSP Inspect"
			icon={FileSearchIcon}
			subtitle={fileName}
		/>
	);
}
