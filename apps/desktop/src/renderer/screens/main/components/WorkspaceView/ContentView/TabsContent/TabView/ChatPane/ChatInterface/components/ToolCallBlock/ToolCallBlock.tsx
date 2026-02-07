import {
	Confirmation,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@superset/ui/ai-elements/confirmation";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import type { ToolCall } from "../../types";

export function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
	return (
		<div className="flex flex-col gap-2">
			<Tool defaultOpen={toolCall.state === "output-error"}>
				<ToolHeader
					title={toolCall.name}
					type="tool-invocation"
					state={toolCall.state}
				/>
				<ToolContent>
					<ToolInput input={toolCall.input} />
					{(toolCall.output || toolCall.errorText) && (
						<ToolOutput
							output={toolCall.output}
							errorText={toolCall.errorText}
						/>
					)}
				</ToolContent>
			</Tool>

			{toolCall.approval && (
				<Confirmation approval={toolCall.approval} state={toolCall.state}>
					<ConfirmationTitle>
						{"approved" in toolCall.approval
							? toolCall.approval.approved
								? `${toolCall.name} was approved`
								: `${toolCall.name} was denied`
							: `Allow ${toolCall.name}?`}
					</ConfirmationTitle>
					<ConfirmationRequest>
						<ConfirmationActions>
							<ConfirmationAction variant="outline">Deny</ConfirmationAction>
							<ConfirmationAction>Allow</ConfirmationAction>
						</ConfirmationActions>
					</ConfirmationRequest>
				</Confirmation>
			)}
		</div>
	);
}
