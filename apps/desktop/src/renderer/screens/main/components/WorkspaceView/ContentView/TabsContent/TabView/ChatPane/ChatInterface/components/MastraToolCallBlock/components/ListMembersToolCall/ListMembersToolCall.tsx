import { UsersIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListMembersToolCallProps {
	part: ToolPart;
}

export function ListMembersToolCall({ part }: ListMembersToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List members"
			icon={UsersIcon}
		/>
	);
}
