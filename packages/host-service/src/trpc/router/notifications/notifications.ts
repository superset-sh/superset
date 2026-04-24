import { z } from "zod";
import { mapEventType } from "../../../events";
import { publicProcedure, router } from "../../index";

/**
 * Input shape matches the v1 `/hook/complete` query-string contract so the
 * agent shell hook (notify-hook.template.sh) can point at either endpoint
 * during the v1→v2 transition. Fields are optional because different agent
 * runtimes emit different subsets.
 */
const hookInput = z.object({
	paneId: z.string().optional(),
	tabId: z.string().optional(),
	terminalId: z.string().optional(),
	workspaceId: z.string().optional(),
	sessionId: z.string().optional(),
	hookSessionId: z.string().optional(),
	resourceId: z.string().optional(),
	eventType: z.string().optional(),
	env: z.string().optional(),
	version: z.string().optional(),
});

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. The agent shell script POSTs here on
	 * session-start / permission-request / task-complete events. We normalize
	 * the event type and fan out over the WebSocket event bus so clients
	 * (desktop renderer, web) can play the finish sound themselves.
	 *
	 * Intentionally unauthenticated. The only thing a caller can do is
	 * cause clients to chime and flash a sidebar indicator — no code
	 * execution, no data access, no state change. Reusing the host-service
	 * PSK for this endpoint would leak the credential into every agent
	 * shell's env for zero practical gain (manifest.authToken already
	 * exposes it to any user-level process).
	 */
	hook: publicProcedure.input(hookInput).mutation(async ({ ctx, input }) => {
		const eventType = mapEventType(input.eventType);
		if (!eventType) {
			return { success: true, ignored: true as const };
		}

		if (!input.workspaceId) {
			return { success: true, ignored: true as const };
		}

		ctx.eventBus.broadcastAgentLifecycle({
			workspaceId: input.workspaceId,
			eventType,
			paneId: input.paneId,
			tabId: input.tabId,
			terminalId: input.terminalId,
			sessionId: input.sessionId,
			hookSessionId: input.hookSessionId,
			resourceId: input.resourceId,
			occurredAt: Date.now(),
		});

		return { success: true, ignored: false as const };
	}),
});
