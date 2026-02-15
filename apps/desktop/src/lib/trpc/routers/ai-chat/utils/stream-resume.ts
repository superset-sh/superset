import type { EventEmitter } from "node:events";
import { RequestContext, superagent } from "@superset/agent";

const EDIT_TOOLS = new Set([
	"mastra_workspace_write_file",
	"mastra_workspace_edit_file",
	"mastra_workspace_delete",
	"mastra_workspace_mkdir",
]);

export interface SessionState {
	emitter: EventEmitter;
	context: Map<
		string,
		{ cwd: string; modelId: string; permissionMode?: string }
	>;
	suspended: Set<string>;
	runIds: Map<string, string>;
}

export async function drainStreamToEmitter(
	stream: { fullStream: AsyncIterable<unknown>; runId?: string },
	sessionId: string,
	state: SessionState,
	permissionMode?: string,
): Promise<void> {
	for await (const chunk of stream.fullStream) {
		const c = chunk as {
			type?: string;
			toolName?: string;
			payload?: { toolName?: string };
		};

		if (c.type === "tool-call-approval") {
			const toolName = c.toolName ?? c.payload?.toolName;

			if (
				permissionMode === "acceptEdits" &&
				toolName &&
				EDIT_TOOLS.has(toolName)
			) {
				const runId = stream.runId ?? state.runIds.get(sessionId);
				if (runId) {
					const ctx = state.context.get(sessionId);
					const reqCtx = ctx
						? new RequestContext([
								["modelId", ctx.modelId],
								["cwd", ctx.cwd],
							])
						: undefined;

					const resumed = await superagent.approveToolCall({
						runId,
						...(reqCtx ? { requestContext: reqCtx } : {}),
					});

					await drainStreamToEmitter(resumed, sessionId, state, permissionMode);
					return;
				}
			}

			state.suspended.add(sessionId);
		}

		state.emitter.emit(sessionId, { type: "chunk", chunk });
	}

	if (!state.suspended.has(sessionId)) {
		state.emitter.emit(sessionId, { type: "done" });
		state.runIds.delete(sessionId);
		state.context.delete(sessionId);
	}
}

export function emitStreamError(
	sessionId: string,
	emitter: EventEmitter,
	error: unknown,
): void {
	console.error(`[ai-chat] Stream error for ${sessionId}:`, error);
	emitter.emit(sessionId, {
		type: "error",
		error: error instanceof Error ? error.message : String(error),
	});
}

export function resumeApprovedStream(opts: {
	sessionId: string;
	runId: string;
	approved: boolean;
	state: SessionState;
	extraContext?: Record<string, string>;
}): void {
	const { sessionId, runId, approved, state, extraContext } = opts;

	state.suspended.delete(sessionId);

	void (async () => {
		try {
			const ctx = state.context.get(sessionId);
			const ctxEntries: [string, string][] = ctx
				? [
						["modelId", ctx.modelId],
						["cwd", ctx.cwd],
					]
				: [];

			if (extraContext) {
				for (const [key, value] of Object.entries(extraContext)) {
					ctxEntries.push([key, value]);
				}
			}

			const reqCtx =
				ctxEntries.length > 0 ? new RequestContext(ctxEntries) : undefined;

			const approvalOpts = {
				runId,
				...(reqCtx ? { requestContext: reqCtx } : {}),
			};

			const stream = approved
				? await superagent.approveToolCall(approvalOpts)
				: await superagent.declineToolCall(approvalOpts);

			await drainStreamToEmitter(stream, sessionId, state, ctx?.permissionMode);
		} catch (error) {
			emitStreamError(sessionId, state.emitter, error);
		}
	})();
}
