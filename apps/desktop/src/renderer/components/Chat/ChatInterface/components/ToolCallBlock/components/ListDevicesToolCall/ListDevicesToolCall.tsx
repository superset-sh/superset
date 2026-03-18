import { MonitorSmartphoneIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListDevicesToolCallProps {
	part: ToolPart;
}

export function ListDevicesToolCall({ part }: ListDevicesToolCallProps) {
	return (
		<SupersetToolCall
			part={part}
			toolName="List devices"
			icon={MonitorSmartphoneIcon}
		/>
	);
}
