import { ListChecksIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListTaskStatusesToolCallProps {
	part: ToolPart;
}

export function ListTaskStatusesToolCall({
	part,
}: ListTaskStatusesToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List task statuses"
			icon={ListChecksIcon}
		/>
	);
}
