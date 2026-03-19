import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatDisplay";

type ApprovalDecision = "approve" | "decline" | "always_allow_category";
type PendingApproval = UseChatDisplayReturn["pendingApproval"];

interface PendingApprovalMessageProps {
	approval: PendingApproval;
	isSubmitting: boolean;
	onRespond: (decision: ApprovalDecision) => Promise<void>;
}

function stringifyArgs(value: unknown): string {
	try {
		if (value === undefined) return "No arguments";
		if (typeof value === "string" && value.trim().length > 0) return value;
		if (typeof value === "string") return "No arguments";
		const serialized = JSON.stringify(value, null, 2);
		return serialized && serialized !== "{}" ? serialized : "No arguments";
	} catch {
		return "Unable to render tool arguments";
	}
}

export function PendingApprovalMessage({
	approval,
	isSubmitting,
	onRespond,
}: PendingApprovalMessageProps) {
	const [selectedDecision, setSelectedDecision] =
		useState<ApprovalDecision | null>(null);
	const inFlightResponseRef = useRef(false);
	const previousToolCallIdRef = useRef<string | null>(null);

	useEffect(() => {
		const currentToolCallId = approval?.toolCallId ?? null;
		if (previousToolCallIdRef.current === currentToolCallId) return;
		previousToolCallIdRef.current = currentToolCallId;
		setSelectedDecision(null);
	}, [approval]);

	if (!approval) return null;

	const toolCallId = approval.toolCallId?.trim() ?? "";
	const toolName =
		approval.toolName?.trim().replaceAll("_", " ") || "tool execution";
	const renderedArgs = stringifyArgs(approval.args);
	const canRespond = toolCallId.length > 0;

	const getDecisionClassName = (decision: ApprovalDecision): string => {
		if (selectedDecision !== decision) return "";
		if (decision === "decline") return "border-destructive text-destructive";
		return "border-primary bg-primary/10 text-primary";
	};

	const handleRespond = async (decision: ApprovalDecision): Promise<void> => {
		if (!canRespond || isSubmitting || inFlightResponseRef.current) return;
		inFlightResponseRef.current = true;
		setSelectedDecision(decision);
		try {
			await onRespond(decision);
		} catch (error) {
			console.error("Failed to submit approval response", error);
			setSelectedDecision(null);
		} finally {
			inFlightResponseRef.current = false;
		}
	};

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
					<div className="text-sm text-foreground">
						The agent requested permission to run {toolName}.
					</div>
					<div className="rounded-md border bg-muted/20 p-3">
						<div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Arguments
						</div>
						<pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap break-words">
							{renderedArgs}
						</pre>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className={getDecisionClassName("always_allow_category")}
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								void handleRespond("always_allow_category");
							}}
						>
							Always allow category
						</Button>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								className={getDecisionClassName("decline")}
								disabled={isSubmitting || !canRespond}
								onClick={() => {
									void handleRespond("decline");
								}}
							>
								Decline
							</Button>
							<Button
								type="button"
								className={getDecisionClassName("approve")}
								disabled={isSubmitting || !canRespond}
								onClick={() => {
									void handleRespond("approve");
								}}
							>
								Approve
							</Button>
						</div>
					</div>
				</div>
			</MessageContent>
		</Message>
	);
}
