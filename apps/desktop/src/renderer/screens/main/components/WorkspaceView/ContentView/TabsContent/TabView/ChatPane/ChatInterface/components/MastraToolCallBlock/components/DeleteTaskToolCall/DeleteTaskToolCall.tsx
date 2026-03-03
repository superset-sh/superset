import { FileXIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface DeleteTaskToolCallProps {
	part: ToolPart;
}

export function DeleteTaskToolCall({ part }: DeleteTaskToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Delete task"
			icon={FileXIcon}
		/>
	);
}
