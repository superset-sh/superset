import { PencilLineIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface UpdateWorkspaceToolCallProps {
	part: ToolPart;
}

export function UpdateWorkspaceToolCall({
	part,
}: UpdateWorkspaceToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Update workspace"
			icon={PencilLineIcon}
		/>
	);
}
