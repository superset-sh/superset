import type {
	ToolCallPart,
	ToolResultPart,
} from "@superset/durable-session/react";
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
import { mapApproval, mapToolCallState } from "../../utils/map-tool-state";

interface ToolCallBlockProps {
	toolCallPart: ToolCallPart;
	toolResultPart?: ToolResultPart;
	onApprove?: (approvalId: string) => void;
	onDeny?: (approvalId: string) => void;
}

export function ToolCallBlock({
	toolCallPart,
	toolResultPart,
	onApprove,
	onDeny,
}: ToolCallBlockProps) {
	const state = mapToolCallState(toolCallPart, toolResultPart);
	const output = toolResultPart?.content ?? toolCallPart.output;
	const errorText = toolResultPart?.error;
	const approval = mapApproval(toolCallPart.approval);

	return (
		<div className="flex flex-col gap-2">
			<Tool defaultOpen={state === "output-error"}>
				<ToolHeader
					title={toolCallPart.name}
					type={toolCallPart.type}
					state={state}
				/>
				<ToolContent>
					<ToolInput input={toolCallPart.arguments} />
					{(output || errorText) && (
						<ToolOutput output={output} errorText={errorText} />
					)}
				</ToolContent>
			</Tool>

			{approval && (
				<Confirmation approval={approval} state={state}>
					<ConfirmationTitle>
						{"approved" in approval
							? approval.approved
								? `${toolCallPart.name} was approved`
								: `${toolCallPart.name} was denied`
							: `Allow ${toolCallPart.name}?`}
					</ConfirmationTitle>
					<ConfirmationRequest>
						<ConfirmationActions>
							<ConfirmationAction
								variant="outline"
								onClick={() => onDeny?.(approval.id)}
							>
								Deny
							</ConfirmationAction>
							<ConfirmationAction onClick={() => onApprove?.(approval.id)}>
								Allow
							</ConfirmationAction>
						</ConfirmationActions>
					</ConfirmationRequest>
				</Confirmation>
			)}
		</div>
	);
}
