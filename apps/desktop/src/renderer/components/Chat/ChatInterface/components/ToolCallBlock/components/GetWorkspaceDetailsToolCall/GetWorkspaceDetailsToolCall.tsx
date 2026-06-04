import { InfoIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface GetWorkspaceDetailsToolCallProps {
	part: ToolPart;
}

export function GetWorkspaceDetailsToolCall({
	part,
}: GetWorkspaceDetailsToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Get workspace details"
			icon={InfoIcon}
		/>
	);
}
