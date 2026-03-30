import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { WrenchIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "./getGenericToolCallState";

type GenericToolCallProps = {
	part: ToolPart;
	toolName: string;
	subtitle?: string;
	icon?: ComponentType<{ className?: string }>;
};

export function GenericToolCall({
	part,
	toolName,
	subtitle,
	icon: Icon = WrenchIcon,
}: GenericToolCallProps) {
	const { output, isError, displayState, errorText } =
		getGenericToolCallState(part);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const hasDetails = part.input != null || output != null || isError;

	return (
		<ToolCallRow
			description={subtitle}
			icon={Icon}
			isError={isError || displayState === "output-error"}
			isPending={isPending}
			title={toolName}
		>
			{hasDetails ? (
				<div className="space-y-2 pl-2">
					{part.input != null && <ToolInput input={part.input} />}
					{(output != null || isError) && (
						<ToolOutput
							output={!isError ? output : undefined}
							errorText={isError ? errorText : undefined}
						/>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
