import { AppWindowIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface GetAppContextToolCallProps {
	part: ToolPart;
}

export function GetAppContextToolCall({ part }: GetAppContextToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="Get app context"
			icon={AppWindowIcon}
		/>
	);
}
