import { FolderTreeIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListWorkspacesToolCallProps {
	part: ToolPart;
}

export function ListWorkspacesToolCall({
	part,
}: ListWorkspacesToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List workspaces"
			icon={FolderTreeIcon}
		/>
	);
}
