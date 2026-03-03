import { FolderKanbanIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListProjectsToolCallProps {
	part: ToolPart;
}

export function ListProjectsToolCall({ part }: ListProjectsToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List projects"
			icon={FolderKanbanIcon}
		/>
	);
}
