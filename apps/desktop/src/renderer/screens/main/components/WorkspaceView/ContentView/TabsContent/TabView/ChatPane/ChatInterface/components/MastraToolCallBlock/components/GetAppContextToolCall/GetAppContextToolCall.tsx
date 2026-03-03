import { AppWindowIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface GetAppContextToolCallProps {
	part: ToolPart;
}

export function GetAppContextToolCall({ part }: GetAppContextToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="Get app context"
			icon={AppWindowIcon}
		/>
	);
}
