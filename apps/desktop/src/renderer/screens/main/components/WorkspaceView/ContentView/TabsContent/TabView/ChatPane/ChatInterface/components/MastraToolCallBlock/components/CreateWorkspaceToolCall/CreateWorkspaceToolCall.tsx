import { FolderPlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface CreateWorkspaceToolCallProps {
	part: ToolPart;
}

export function CreateWorkspaceToolCall({
	part,
}: CreateWorkspaceToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Create workspace"
			icon={FolderPlusIcon}
		/>
	);
}
