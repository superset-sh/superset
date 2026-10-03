import { observable } from "@trpc/server/observable";
import {
	type FilePaneOpenRequest,
	filePaneOpenRequests,
} from "main/lib/file-panes/file-pane-open-requests";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createFilePanesRouter = () => {
	return router({
		// File-open requests from the CLI via the browser bridge. Each request
		// names the window that should handle it, so only that window's global
		// hook navigates to the workspace and opens the panes.
		onOpenRequest: publicProcedure.subscription(({ ctx }) => {
			const windowId = ctx.senderWindow?.id;
			return observable<FilePaneOpenRequest>((emit) => {
				const handler = (request: FilePaneOpenRequest) => {
					if (request.targetWindowId === windowId) emit.next(request);
				};
				filePaneOpenRequests.on("open-request", handler);
				return () => {
					filePaneOpenRequests.off("open-request", handler);
				};
			});
		}),

		resolveOpenRequest: publicProcedure
			.input(
				z.object({
					requestId: z.string(),
					outcome: z.discriminatedUnion("ok", [
						z.object({ ok: z.literal(true), paneIds: z.array(z.string()) }),
						z.object({ ok: z.literal(false), error: z.string() }),
					]),
				}),
			)
			.mutation(({ input }) => ({
				accepted: filePaneOpenRequests.resolve(input.requestId, input.outcome),
			})),
	});
};
