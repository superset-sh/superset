import type React from "react";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ChatMessage,
	ModelOption,
	PermissionMode,
	TokenUsage,
	ToolApprovalRequest,
} from "../../types";

interface UseChatActionsParams {
	sessionId: string;
	selectedModel: ModelOption;
	cwd: string;
	permissionMode: PermissionMode;
	thinkingEnabled: boolean;
	setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
	setTurnUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
	setPendingApproval: React.Dispatch<
		React.SetStateAction<ToolApprovalRequest | null>
	>;
	activeAgentCallIdRef: React.MutableRefObject<string | null>;
	runIdRef: React.MutableRefObject<string | null>;
	endStream: (error?: string) => void;
}

export function useChatActions({
	sessionId,
	selectedModel,
	cwd,
	permissionMode,
	thinkingEnabled,
	setIsStreaming,
	setMessages,
	setError,
	setTurnUsage,
	setPendingApproval,
	activeAgentCallIdRef,
	runIdRef,
	endStream,
}: UseChatActionsParams) {
	const triggerAgent = electronTrpc.aiChat.superagent.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			endStream(err.message);
		},
	});

	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;

			setError(null);
			setTurnUsage({
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			});
			setPendingApproval(null);
			runIdRef.current = null;

			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					role: "user",
					parts: [{ type: "text", text }],
				},
				{
					id: crypto.randomUUID(),
					role: "assistant",
					parts: [],
				},
			]);

			activeAgentCallIdRef.current = null;
			setIsStreaming(true);
			triggerAgent.mutate({
				sessionId,
				text,
				modelId: selectedModel.id,
				cwd,
				permissionMode,
				thinkingEnabled,
			});
		},
		[
			triggerAgent,
			sessionId,
			selectedModel.id,
			cwd,
			permissionMode,
			thinkingEnabled,
			activeAgentCallIdRef,
			runIdRef,
			setError,
			setTurnUsage,
			setPendingApproval,
			setMessages,
			setIsStreaming,
		],
	);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			abortAgent.mutate({ sessionId });
			setIsStreaming(false);
		},
		[abortAgent, sessionId, setIsStreaming],
	);

	return { handleSend, handleStop };
}
