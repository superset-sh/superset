import { Trash2Icon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface DeleteWorkspaceToolCallProps {
	part: ToolPart;
}

export function DeleteWorkspaceToolCall({
	part,
}: DeleteWorkspaceToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Delete workspace"
			icon={Trash2Icon}
		/>
	);
}
