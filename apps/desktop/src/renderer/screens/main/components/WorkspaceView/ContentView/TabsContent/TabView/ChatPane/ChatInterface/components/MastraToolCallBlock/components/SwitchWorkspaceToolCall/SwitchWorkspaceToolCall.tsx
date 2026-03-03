import { ArrowRightLeftIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface SwitchWorkspaceToolCallProps {
	part: ToolPart;
}

export function SwitchWorkspaceToolCall({
	part,
}: SwitchWorkspaceToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Switch workspace"
			icon={ArrowRightLeftIcon}
		/>
	);
}
