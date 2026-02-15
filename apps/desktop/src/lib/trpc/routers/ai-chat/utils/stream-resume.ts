import type { EventEmitter } from "node:events";
import { RequestContext, superagent } from "@superset/agent";

/** Module-level session state maps, passed in to avoid tight coupling. */
export interface SessionState {
	emitter: EventEmitter;
	context: Map<string, { cwd: string; modelId: string }>;
	suspended: Set<string>;
	runIds: Map<string, string>;
}

/**
 * Resume a superagent stream after a tool call approval (or answer).
 *
 * Shared by `approveToolCall` and `answerQuestion` mutations to avoid
 * duplicating the build-context → iterate-stream → emit-chunks logic.
 */
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
				ctxEntries.length > 0
					? new RequestContext(ctxEntries)
					: undefined;

			const approvalOpts = {
				runId,
				...(reqCtx ? { requestContext: reqCtx } : {}),
			};

			const stream = approved
				? await superagent.approveToolCall(approvalOpts)
				: await superagent.declineToolCall(approvalOpts);

			for await (const chunk of stream.fullStream) {
				const c = chunk as { type?: string };

				if (c.type === "tool-call-approval") {
					state.suspended.add(sessionId);
				}

				state.emitter.emit(sessionId, { type: "chunk", chunk });
			}

			if (!state.suspended.has(sessionId)) {
				state.emitter.emit(sessionId, { type: "done" });
				state.runIds.delete(sessionId);
				state.context.delete(sessionId);
			}
		} catch (error) {
			console.error(
				`[ai-chat/resumeApprovedStream] Stream failed for ${sessionId}:`,
				error,
			);
			state.emitter.emit(sessionId, {
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	})();
}
