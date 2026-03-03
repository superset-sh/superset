import { FileSearchIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface GetTaskToolCallProps {
	part: ToolPart;
}

export function GetTaskToolCall({ part }: GetTaskToolCallProps) {
	return <GenericToolCall part={part} toolName="Get task" icon={FileSearchIcon} />;
}
