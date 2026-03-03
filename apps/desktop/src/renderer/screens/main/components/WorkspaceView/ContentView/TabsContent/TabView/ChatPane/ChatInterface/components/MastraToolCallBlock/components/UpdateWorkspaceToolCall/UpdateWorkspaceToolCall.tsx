import { PencilLineIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface UpdateWorkspaceToolCallProps {
	part: ToolPart;
}

export function UpdateWorkspaceToolCall({
	part,
}: UpdateWorkspaceToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Update workspace"
			icon={PencilLineIcon}
		/>
	);
}
