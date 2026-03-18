import { ArrowRightLeftIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface SwitchWorkspaceToolCallProps {
	part: ToolPart;
}

export function SwitchWorkspaceToolCall({
	part,
}: SwitchWorkspaceToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Switch workspace"
			icon={ArrowRightLeftIcon}
		/>
	);
}
