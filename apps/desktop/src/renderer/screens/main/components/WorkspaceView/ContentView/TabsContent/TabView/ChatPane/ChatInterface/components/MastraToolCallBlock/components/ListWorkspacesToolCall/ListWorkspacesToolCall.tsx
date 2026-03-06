import { FolderTreeIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListWorkspacesToolCallProps {
	part: ToolPart;
}

export function ListWorkspacesToolCall({ part }: ListWorkspacesToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="List workspaces"
			icon={FolderTreeIcon}
		/>
	);
}
