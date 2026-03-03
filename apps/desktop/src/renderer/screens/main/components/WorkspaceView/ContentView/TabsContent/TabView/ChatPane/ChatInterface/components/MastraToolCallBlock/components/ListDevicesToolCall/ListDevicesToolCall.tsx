import { MonitorSmartphoneIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListDevicesToolCallProps {
	part: ToolPart;
}

export function ListDevicesToolCall({ part }: ListDevicesToolCallProps) {
	return (
		<GenericToolCall
			part={part}
			toolName="List devices"
			icon={MonitorSmartphoneIcon}
		/>
	);
}
