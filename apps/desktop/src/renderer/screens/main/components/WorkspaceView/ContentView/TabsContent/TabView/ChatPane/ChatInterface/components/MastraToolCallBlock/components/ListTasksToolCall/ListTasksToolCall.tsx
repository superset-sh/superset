import { ClipboardListIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListTasksToolCallProps {
	part: ToolPart;
}

export function ListTasksToolCall({ part }: ListTasksToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List tasks"
			icon={ClipboardListIcon}
		/>
	);
}
