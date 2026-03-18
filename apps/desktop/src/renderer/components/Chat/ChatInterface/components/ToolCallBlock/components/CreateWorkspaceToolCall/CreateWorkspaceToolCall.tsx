import { FolderPlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface CreateWorkspaceToolCallProps {
	part: ToolPart;
}

export function CreateWorkspaceToolCall({
	part,
}: CreateWorkspaceToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Create workspace"
			icon={FolderPlusIcon}
		/>
	);
}
