import { FilePlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface CreateTaskToolCallProps {
	part: ToolPart;
}

export function CreateTaskToolCall({ part }: CreateTaskToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Create task"
			icon={FilePlusIcon}
		/>
	);
}
