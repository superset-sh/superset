import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ToolCallBlock } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import type { ChatPendingPlanApproval } from "../../ChatMessageList.types";
import { PendingPlanApprovalMessage } from "../PendingPlanApprovalMessage";

interface ToolPreviewMessageProps {
	previewToolParts: ToolPart[];
	workspaceId: string;
	sessionId: string | null;
	organizationId: string | null;
	workspaceCwd?: string;
	pendingPlanApproval: ChatPendingPlanApproval;
	pendingPlanToolCallId: string | null;
	isPlanSubmitting: boolean;
	onPlanRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

export function ToolPreviewMessage({
	previewToolParts,
	workspaceId,
	sessionId,
	organizationId,
	workspaceCwd,
	pendingPlanApproval,
	pendingPlanToolCallId,
	isPlanSubmitting,
	onPlanRespond,
}: ToolPreviewMessageProps) {
	return (
		<Message from="assistant">
			<MessageContent>
				<div className="space-y-3">
					{previewToolParts.map((part) => {
						return (
							<div
								key={`tool-preview-${part.toolCallId}`}
								className="space-y-3"
							>
								<ToolCallBlock
									part={part}
									workspaceId={workspaceId}
									sessionId={sessionId}
									organizationId={organizationId}
									workspaceCwd={workspaceCwd}
								/>
								{pendingPlanApproval &&
								pendingPlanToolCallId &&
								pendingPlanToolCallId === part.toolCallId ? (
									<PendingPlanApprovalMessage
										inline
										planApproval={pendingPlanApproval}
										isSubmitting={isPlanSubmitting}
										onRespond={onPlanRespond}
									/>
								) : null}
							</div>
						);
					})}
				</div>
			</MessageContent>
		</Message>
	);
}
