import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "./getGenericToolCallState";

type GenericToolCallProps = {
	part: ToolPart;
	toolName: string;
};

export function GenericToolCall({ part, toolName }: GenericToolCallProps) {
	const { output, isError, displayState, errorText } =
		getGenericToolCallState(part);

	return (
		<Tool>
			<ToolHeader title={toolName} state={displayState} />
			<ToolContent>
				{part.input != null && <ToolInput input={part.input} />}
				{(output != null || isError) && (
					<ToolOutput
						output={!isError ? output : undefined}
						errorText={isError ? errorText : undefined}
					/>
				)}
			</ToolContent>
		</Tool>
	);
}
