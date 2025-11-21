import { observable } from "@trpc/server/observable";
import {
	notificationsEmitter,
	type AgentCompleteEvent,
} from "main/lib/notifications/server";
import { publicProcedure, router } from "..";

export const createNotificationsRouter = () => {
	return router({
		/**
		 * Subscribe to all agent completion events.
		 * Emits whenever any agent completes in any tab.
		 */
		agentComplete: publicProcedure.subscription(() => {
			return observable<AgentCompleteEvent>((emit) => {
				const onComplete = (event: AgentCompleteEvent) => {
					emit.next(event);
				};

				notificationsEmitter.on("agent-complete", onComplete);

				return () => {
					notificationsEmitter.off("agent-complete", onComplete);
				};
			});
		}),
	});
};
