import type React from "react";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ChatMessage,
	PermissionMode,
	ToolApprovalRequest,
} from "../../types";

interface UseToolApprovalParams {
	sessionId: string;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useToolApproval({
	sessionId,
	setPermissionMode,
	setMessages,
}: UseToolApprovalParams) {
	const [pendingApproval, setPendingApproval] =
		useState<ToolApprovalRequest | null>(null);

	const approveToolCallMutation =
		electronTrpc.aiChat.approveToolCall.useMutation();
	const answerQuestionMutation =
		electronTrpc.aiChat.answerQuestion.useMutation();

	const handleApprove = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: true,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleAlwaysAllow = useCallback(() => {
		if (!pendingApproval) return;
		setPermissionMode("bypassPermissions");
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: true,
			permissionMode: "bypassPermissions",
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId, setPermissionMode]);

	const handleDecline = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: false,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleAnswer = useCallback(
		(toolCallId: string, answers: Record<string, string>) => {
			setMessages((prev) =>
				prev.map((msg) => {
					if (msg.role !== "assistant") return msg;
					return {
						...msg,
						parts: msg.parts.map((part) =>
							part.type === "tool-call" && part.toolCallId === toolCallId
								? {
										...part,
										status: "done" as const,
										result: { answers },
									}
								: part,
						),
					};
				}),
			);

			if (pendingApproval) {
				answerQuestionMutation.mutate({
					sessionId,
					runId: pendingApproval.runId,
					answers,
				});
				setPendingApproval(null);
			}
		},
		[pendingApproval, answerQuestionMutation, sessionId, setMessages],
	);

	return {
		pendingApproval,
		setPendingApproval,
		handleApprove,
		handleAlwaysAllow,
		handleDecline,
		handleAnswer,
	};
}
