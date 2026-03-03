import { BotIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface StartAgentSessionToolCallProps {
	part: ToolPart;
}

export function StartAgentSessionToolCall({
	part,
}: StartAgentSessionToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Start agent session"
			icon={BotIcon}
		/>
	);
}
