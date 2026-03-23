import { BotIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface StartAgentSessionToolCallProps {
	part: ToolPart;
	toolName?: string;
}

export function StartAgentSessionToolCall({
	part,
	toolName = "Start agent session",
}: StartAgentSessionToolCallProps) {
	return <SupersetToolCall part={part} toolName={toolName} icon={BotIcon} />;
}
