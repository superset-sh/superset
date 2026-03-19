import { FolderKanbanIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListProjectsToolCallProps {
	part: ToolPart;
}

export function ListProjectsToolCall({ part }: ListProjectsToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="List projects"
			icon={FolderKanbanIcon}
		/>
	);
}
