import { query } from "@anthropic-ai/claude-agent-sdk";
import type { StreamChunk } from "@tanstack/ai";
import { createPermissionRequest } from "./permission-manager";
import { createConverter } from "./sdk-to-ai-chunks";
import { getClaudeSessionId, setClaudeSessionId } from "./session-store";
import type {
	ExecuteAgentParams,
	ExecuteAgentResult,
	PermissionResult,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_AGENT_TURNS = 25;

export async function executeAgent(
	params: ExecuteAgentParams,
): Promise<ExecuteAgentResult> {
	const {
		sessionId,
		prompt,
		cwd,
		env: agentEnv,
		model,
		permissionMode = "bypassPermissions",
		resume = true,
		allowedTools,
		disallowedTools,
		maxBudgetUsd,
		maxThinkingTokens,
		fallbackModel,
		additionalDirectories,
		betas,
		pathToClaudeCodeExecutable,
		signal,
		onChunk,
		onPermissionRequest,
		onEvent,
	} = params;

	const claudeSessionId = resume ? getClaudeSessionId(sessionId) : undefined;

	const queryEnv: Record<string, string> = { ...agentEnv };
	queryEnv.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";

	const converter = createConverter();
	const { messageId, runId } = converter.state;

	const needsApproval = permissionMode !== "bypassPermissions";

	const canUseTool = needsApproval
		? async (
				toolName: string,
				input: Record<string, unknown>,
				options: { toolUseID: string; signal: AbortSignal },
			): Promise<PermissionResult> => {
				const toolUseId = options.toolUseID;

				if (onPermissionRequest) {
					return onPermissionRequest({
						toolUseId,
						toolName,
						input,
						signal: options.signal,
					});
				}

				// Fallback for backward compatibility
				return createPermissionRequest({
					toolUseId,
					signal: options.signal,
				});
			}
		: undefined;

	const abortController = new AbortController();

	if (signal) {
		if (signal.aborted) {
			abortController.abort();
		}
		signal.addEventListener(
			"abort",
			() => {
				abortController.abort();
			},
			{ once: true },
		);
	}

	const result = query({
		prompt,
		options: {
			...(claudeSessionId && { resume: claudeSessionId }),
			cwd,
			model: model ?? DEFAULT_MODEL,
			maxTurns: MAX_AGENT_TURNS,
			includePartialMessages: true,
			permissionMode,
			settingSources: ["user", "project", "local"],
			systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
			env: queryEnv,
			abortController,
			...(canUseTool && { canUseTool }),
			...(allowedTools && { allowedTools }),
			...(disallowedTools && { disallowedTools }),
			...(maxBudgetUsd !== undefined && { maxBudgetUsd }),
			...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
			...(fallbackModel && { fallbackModel }),
			...(additionalDirectories && { additionalDirectories }),
			...(betas && { betas: betas as Array<"context-1m-2025-08-07"> }),
			...(pathToClaudeCodeExecutable && { pathToClaudeCodeExecutable }),
		},
	});

	try {
		for await (const message of result) {
			if (signal?.aborted) break;

			const msg = message as Record<string, unknown>;

			if (msg.type === "system" && msg.subtype === "init") {
				const sdkSessionId = msg.session_id as string | undefined;
				if (sdkSessionId && sessionId) {
					setClaudeSessionId(sessionId, sdkSessionId);
					onEvent?.({
						type: "session_initialized",
						sessionId,
						claudeSessionId: sdkSessionId,
					});
				}
				continue;
			}

			const chunks = converter.convert(message);

			for (const chunk of chunks) {
				await onChunk?.(chunk);
				onEvent?.({ type: "chunk_sent", chunk });
			}
		}

		onEvent?.({ type: "completed" });

		return {
			success: true,
			messageId,
			runId,
		};
	} catch (error) {
		console.error("[agent/executor] Execution error:", error);

		const err = error as Error;

		// Don't treat AbortError as failure
		if (err.name === "AbortError") {
			return {
				success: true,
				messageId,
				runId,
			};
		}

		onEvent?.({ type: "error", error: err });

		if (onChunk) {
			const errorChunk: StreamChunk = {
				type: "RUN_ERROR",
				runId,
				error: {
					message: err.message ?? "Unknown error",
				},
				timestamp: Date.now(),
			};
			await onChunk(errorChunk);
		}

		return {
			success: false,
			error: err.message ?? "Unknown error",
			messageId,
			runId,
		};
	}
}
