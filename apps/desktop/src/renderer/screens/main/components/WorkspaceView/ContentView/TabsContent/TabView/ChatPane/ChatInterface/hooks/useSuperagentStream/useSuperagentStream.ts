import type React from "react";
import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ChatMessage,
	MastraChunk,
	MessagePart,
	TokenUsage,
	ToolApprovalRequest,
} from "../../types";

interface UseSuperagentStreamParams {
	sessionId: string;
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
	setTurnUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
	setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
	setPendingApproval: React.Dispatch<
		React.SetStateAction<ToolApprovalRequest | null>
	>;
}

interface UseSuperagentStreamReturn {
	activeAgentCallIdRef: React.MutableRefObject<string | null>;
	runIdRef: React.MutableRefObject<string | null>;
	/** Call when the stream ends (done, error, abort, or mutation failure). */
	endStream: (error?: string) => void;
}

export function useSuperagentStream({
	sessionId,
	setMessages,
	setIsStreaming,
	setError,
	setTurnUsage,
	setSessionUsage,
	setPendingApproval,
}: UseSuperagentStreamParams): UseSuperagentStreamReturn {
	const activeAgentCallIdRef = useRef<string | null>(null);
	const runIdRef = useRef<string | null>(null);

	// Helper: update the last assistant message's parts
	const updateLastAssistant = useCallback(
		(updater: (parts: MessagePart[]) => MessagePart[]) => {
			setMessages((prev) => {
				const last = prev[prev.length - 1];
				if (!last || last.role !== "assistant") return prev;
				return [...prev.slice(0, -1), { ...last, parts: updater(last.parts) }];
			});
		},
		[setMessages],
	);

	// Helper: update the active agent-call's nested parts
	const updateActiveAgentParts = useCallback(
		(agentCallId: string, updater: (parts: MessagePart[]) => MessagePart[]) => {
			setMessages((prev) => {
				const last = prev[prev.length - 1];
				if (!last || last.role !== "assistant") return prev;
				return [
					...prev.slice(0, -1),
					{
						...last,
						parts: last.parts.map((part) =>
							part.type === "agent-call" && part.toolCallId === agentCallId
								? { ...part, parts: updater(part.parts) }
								: part,
						),
					},
				];
			});
		},
		[setMessages],
	);

	// Centralised cleanup for every stream-ending path (done, error, abort, mutation failure).
	const endStream = useCallback(
		(error?: string) => {
			const activeId = activeAgentCallIdRef.current;
			if (activeId) {
				updateLastAssistant((parts) =>
					parts.map((part) =>
						part.type === "agent-call" && part.toolCallId === activeId
							? { ...part, status: "done" as const }
							: part,
					),
				);
				activeAgentCallIdRef.current = null;
			}
			setIsStreaming(false);
			if (error) setError(error);
		},
		[updateLastAssistant, setIsStreaming, setError],
	);

	electronTrpc.aiChat.superagentStream.useSubscription(
		{ sessionId },
		{
			onData: (event) => {
				if (event.type === "done" || event.type === "error") {
					endStream(
						event.type === "error"
							? typeof event.error === "string"
								? event.error
								: "An error occurred"
							: undefined,
					);
					return;
				}
				if (event.type === "chunk") {
					const chunk = event.chunk as MastraChunk;
					const p = chunk.payload;

					// Extract tool name from various possible locations
					const raw = chunk as unknown as Record<string, unknown>;
					const chunkToolName = p?.toolName ?? raw.toolName ?? "unknown";
					const chunkToolCallId = p?.toolCallId ?? raw.toolCallId;

					// --- Sub-agent chunk routing ---
					const activeId = activeAgentCallIdRef.current;

					// Check if this tool-result closes the active agent call
					if (
						activeId &&
						chunk.type === "tool-result" &&
						String(chunkToolCallId) === activeId
					) {
						activeAgentCallIdRef.current = null;
						const resultText =
							typeof p?.result === "object" && p?.result !== null
								? ((p.result as Record<string, unknown>).text ??
									JSON.stringify(p.result))
								: String(p?.result ?? "");
						setMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [
								...prev.slice(0, -1),
								{
									...last,
									parts: last.parts.map((part) =>
										part.type === "agent-call" && part.toolCallId === activeId
											? {
													...part,
													status: "done" as const,
													result: String(resultText),
												}
											: part,
									),
								},
							];
						});
						return;
					}

					// If a sub-agent is active, route text/tool chunks into its nested parts
					if (activeId) {
						handleAgentChunk(
							chunk,
							activeId,
							chunkToolCallId,
							chunkToolName,
							p,
							raw,
							updateActiveAgentParts,
						);
						return;
					}

					// --- Top-level chunk routing ---
					handleTopLevelChunk(
						chunk,
						chunkToolCallId,
						chunkToolName,
						p,
						raw,
						activeAgentCallIdRef,
						runIdRef,
						updateLastAssistant,
						setTurnUsage,
						setSessionUsage,
						setPendingApproval,
					);
				}
			},
			onError: (err) => {
				console.error("[chat] Subscription error:", err);
				endStream(
					err instanceof Error ? err.message : "Subscription connection failed",
				);
			},
		},
	);

	return { activeAgentCallIdRef, runIdRef, endStream };
}

// --- Sub-agent chunk handler ---
function handleAgentChunk(
	chunk: MastraChunk,
	activeId: string,
	chunkToolCallId: unknown,
	chunkToolName: unknown,
	p: MastraChunk["payload"],
	raw: Record<string, unknown>,
	updateActiveAgentParts: (
		agentCallId: string,
		updater: (parts: MessagePart[]) => MessagePart[],
	) => void,
) {
	switch (chunk.type) {
		case "text-delta": {
			if (!p?.text) break;
			updateActiveAgentParts(activeId, (parts) => {
				const lastPart = parts[parts.length - 1];
				if (lastPart?.type === "text") {
					return [
						...parts.slice(0, -1),
						{
							...lastPart,
							text: lastPart.text + p.text,
						},
					];
				}
				return [...parts, { type: "text", text: p.text ?? "" }];
			});
			break;
		}

		case "tool-call": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) => {
				const existing = parts.find(
					(pt) =>
						pt.type === "tool-call" &&
						pt.toolCallId === String(chunkToolCallId),
				);
				if (existing) {
					return parts.map((pt) =>
						pt.type === "tool-call" && pt.toolCallId === String(chunkToolCallId)
							? {
									...pt,
									toolName:
										pt.toolName === "unknown"
											? String(chunkToolName)
											: pt.toolName,
									args: p?.args ?? pt.args,
									status: "calling" as const,
								}
							: pt,
					);
				}
				return [
					...parts,
					{
						type: "tool-call" as const,
						toolCallId: String(chunkToolCallId),
						toolName: String(chunkToolName),
						args: p?.args,
						status: "calling" as const,
					},
				];
			});
			break;
		}

		case "tool-call-input-streaming-start": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) => [
				...parts,
				{
					type: "tool-call" as const,
					toolCallId: String(chunkToolCallId),
					toolName: String(chunkToolName),
					args: "",
					status: "streaming" as const,
				},
			]);
			break;
		}

		case "tool-call-delta": {
			if (!chunkToolCallId || !p?.argsTextDelta) break;
			const delta = p.argsTextDelta;
			updateActiveAgentParts(activeId, (parts) =>
				parts.map((part) =>
					part.type === "tool-call" &&
					part.toolCallId === String(chunkToolCallId)
						? {
								...part,
								args: typeof part.args === "string" ? part.args + delta : delta,
							}
						: part,
				),
			);
			break;
		}

		case "tool-call-input-streaming-end": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) =>
				parts.map((part) => {
					if (
						part.type === "tool-call" &&
						part.toolCallId === String(chunkToolCallId)
					) {
						let parsedArgs = part.args;
						if (typeof part.args === "string") {
							try {
								parsedArgs = JSON.parse(part.args);
							} catch {
								// keep as string
							}
						}
						return {
							...part,
							args: parsedArgs,
							status: "calling" as const,
						};
					}
					return part;
				}),
			);
			break;
		}

		case "tool-result": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) =>
				parts.map((part) =>
					part.type === "tool-call" &&
					part.toolCallId === String(chunkToolCallId)
						? {
								...part,
								result: p?.result,
								isError: p?.isError,
								status: "done" as const,
							}
						: part,
				),
			);
			break;
		}

		case "tool-output": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) =>
				parts.map((part) =>
					part.type === "tool-call" &&
					part.toolCallId === String(chunkToolCallId)
						? {
								...part,
								result: p?.output ?? raw.output,
							}
						: part,
				),
			);
			break;
		}

		case "tool-error": {
			if (!chunkToolCallId) break;
			updateActiveAgentParts(activeId, (parts) =>
				parts.map((part) =>
					part.type === "tool-call" &&
					part.toolCallId === String(chunkToolCallId)
						? {
								...part,
								result: p?.error ?? "Tool execution failed",
								isError: true,
								status: "done" as const,
							}
						: part,
				),
			);
			break;
		}

		default:
			// Ignore other chunk types inside agent call (finish, step-start, etc.)
			break;
	}
}

// --- Top-level chunk handler ---
function handleTopLevelChunk(
	chunk: MastraChunk,
	chunkToolCallId: unknown,
	chunkToolName: unknown,
	p: MastraChunk["payload"],
	raw: Record<string, unknown>,
	activeAgentCallIdRef: React.MutableRefObject<string | null>,
	runIdRef: React.MutableRefObject<string | null>,
	updateLastAssistant: (
		updater: (parts: MessagePart[]) => MessagePart[],
	) => void,
	setTurnUsage: React.Dispatch<React.SetStateAction<TokenUsage>>,
	setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>>,
	setPendingApproval: React.Dispatch<
		React.SetStateAction<ToolApprovalRequest | null>
	>,
) {
	switch (chunk.type) {
		case "text-delta": {
			if (!p?.text) break;
			updateLastAssistant((parts) => {
				const lastPart = parts[parts.length - 1];
				if (lastPart?.type === "text") {
					return [
						...parts.slice(0, -1),
						{ ...lastPart, text: lastPart.text + p.text },
					];
				}
				return [...parts, { type: "text", text: p.text ?? "" }];
			});
			break;
		}

		case "tool-call": {
			if (!chunkToolCallId) break;

			// Check if this is a sub-agent call
			if (String(chunkToolName).startsWith("agent-")) {
				const agentName = String(chunkToolName).replace(/^agent-/, "");
				const prompt =
					typeof p?.args === "object" && p?.args !== null
						? (((p.args as Record<string, unknown>).prompt as string) ?? "")
						: "";
				activeAgentCallIdRef.current = String(chunkToolCallId);
				updateLastAssistant((parts) => [
					// Filter out any stale ToolCallPart created by
					// tool-call-input-streaming-start before we knew the name
					...parts.filter(
						(pt) =>
							!(
								pt.type === "tool-call" &&
								pt.toolCallId === String(chunkToolCallId)
							),
					),
					{
						type: "agent-call" as const,
						toolCallId: String(chunkToolCallId),
						agentName,
						prompt,
						status: "running" as const,
						parts: [],
					},
				]);
				break;
			}

			// Regular tool call
			updateLastAssistant((parts) => {
				const existing = parts.find(
					(pt) => pt.type === "tool-call" && pt.toolCallId === chunkToolCallId,
				);
				if (existing) {
					return parts.map((pt) =>
						pt.type === "tool-call" && pt.toolCallId === chunkToolCallId
							? {
									...pt,
									toolName:
										pt.toolName === "unknown"
											? String(chunkToolName)
											: pt.toolName,
									args: p?.args ?? pt.args,
									status: "calling" as const,
								}
							: pt,
					);
				}
				return [
					...parts,
					{
						type: "tool-call" as const,
						toolCallId: String(chunkToolCallId),
						toolName: String(chunkToolName),
						args: p?.args,
						status: "calling" as const,
					},
				];
			});
			break;
		}

		case "tool-call-input-streaming-start": {
			if (!chunkToolCallId) break;
			// Skip creating a ToolCallPart for sub-agent tools;
			// the tool-call chunk will create an AgentCallPart instead
			if (String(chunkToolName).startsWith("agent-")) break;
			updateLastAssistant((parts) => [
				...parts,
				{
					type: "tool-call" as const,
					toolCallId: String(chunkToolCallId),
					toolName: String(chunkToolName),
					args: "",
					status: "streaming" as const,
				},
			]);
			break;
		}

		case "tool-call-delta": {
			if (!chunkToolCallId || !p?.argsTextDelta) break;
			// Skip arg streaming for sub-agent tools
			if (String(chunkToolName).startsWith("agent-")) break;
			const delta = p.argsTextDelta;
			updateLastAssistant((parts) =>
				parts.map((part) =>
					part.type === "tool-call" && part.toolCallId === chunkToolCallId
						? {
								...part,
								args: typeof part.args === "string" ? part.args + delta : delta,
							}
						: part,
				),
			);
			break;
		}

		case "tool-call-input-streaming-end": {
			if (!chunkToolCallId) break;
			// Skip for sub-agent tools
			if (String(chunkToolName).startsWith("agent-")) break;
			updateLastAssistant((parts) =>
				parts.map((part) => {
					if (
						part.type === "tool-call" &&
						part.toolCallId === chunkToolCallId
					) {
						let parsedArgs = part.args;
						if (typeof part.args === "string") {
							try {
								parsedArgs = JSON.parse(part.args);
							} catch {
								// keep as string
							}
						}
						return {
							...part,
							args: parsedArgs,
							status: "calling" as const,
						};
					}
					return part;
				}),
			);
			break;
		}

		case "tool-result": {
			if (!chunkToolCallId) break;
			updateLastAssistant((parts) =>
				parts.map((part) =>
					part.type === "tool-call" && part.toolCallId === chunkToolCallId
						? {
								...part,
								result: p?.result,
								isError: p?.isError,
								status: "done" as const,
							}
						: part,
				),
			);
			break;
		}

		case "tool-output": {
			if (!chunkToolCallId) break;
			updateLastAssistant((parts) =>
				parts.map((part) =>
					part.type === "tool-call" && part.toolCallId === chunkToolCallId
						? {
								...part,
								result: p?.output ?? (raw as Record<string, unknown>).output,
							}
						: part,
				),
			);
			break;
		}

		case "tool-error": {
			if (!chunkToolCallId) break;
			updateLastAssistant((parts) =>
				parts.map((part) =>
					part.type === "tool-call" && part.toolCallId === chunkToolCallId
						? {
								...part,
								result: p?.error ?? "Tool execution failed",
								isError: true,
								status: "done" as const,
							}
						: part,
				),
			);
			break;
		}

		// --- Custom chunk types ---
		case "usage": {
			const usage = p as unknown as
				| {
						promptTokens?: number;
						completionTokens?: number;
						totalTokens?: number;
				  }
				| undefined;
			if (usage) {
				setTurnUsage((prev) => ({
					promptTokens: prev.promptTokens + (usage.promptTokens ?? 0),
					completionTokens:
						prev.completionTokens + (usage.completionTokens ?? 0),
					totalTokens: prev.totalTokens + (usage.totalTokens ?? 0),
				}));
				setSessionUsage((prev) => ({
					promptTokens: prev.promptTokens + (usage.promptTokens ?? 0),
					completionTokens:
						prev.completionTokens + (usage.completionTokens ?? 0),
					totalTokens: prev.totalTokens + (usage.totalTokens ?? 0),
				}));
			}
			break;
		}

		case "run-id": {
			const rid = p as unknown as { runId?: string } | undefined;
			if (rid?.runId) {
				runIdRef.current = rid.runId;
			}
			break;
		}

		case "tool-call-approval": {
			const approvalData = {
				toolCallId: String(
					p?.toolCallId ?? raw.toolCallId ?? chunkToolCallId ?? "",
				),
				toolName: String(
					p?.toolName ?? raw.toolName ?? chunkToolName ?? "unknown",
				),
				args: p?.args ?? raw.args,
			};
			if (runIdRef.current) {
				setPendingApproval({
					runId: runIdRef.current,
					toolCallId: approvalData.toolCallId,
					toolName: approvalData.toolName,
					args: approvalData.args,
				});
			} else {
				console.warn(
					"[chat] tool-call-approval received but no runId available",
				);
			}
			break;
		}

		default:
			break;
	}
}
