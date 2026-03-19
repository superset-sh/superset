import { Trash2Icon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface DeleteWorkspaceToolCallProps {
	part: ToolPart;
}

export function DeleteWorkspaceToolCall({
	part,
}: DeleteWorkspaceToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Delete workspace"
			icon={Trash2Icon}
		/>
	);
}
