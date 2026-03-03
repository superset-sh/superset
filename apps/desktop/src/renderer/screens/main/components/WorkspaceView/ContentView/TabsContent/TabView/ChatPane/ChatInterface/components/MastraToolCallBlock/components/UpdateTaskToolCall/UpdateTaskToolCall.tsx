import { FilePenIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface UpdateTaskToolCallProps {
	part: ToolPart;
}

export function UpdateTaskToolCall({ part }: UpdateTaskToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Update task"
			icon={FilePenIcon}
		/>
	);
}
