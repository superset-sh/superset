import {
	PANE_LAYOUT_ERROR_CODES,
	type PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import { observable } from "@trpc/server/observable";
import {
	type PaneLayoutRendererRequest,
	paneLayoutRequests,
} from "main/lib/pane-layout/pane-layout-requests";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createPaneLayoutRouter = () => {
	return router({
		// Layout ops from the CLI (via the bridge), scoped to the one window
		// main picked for each request.
		onRequest: publicProcedure.subscription(({ ctx }) => {
			return observable<PaneLayoutRendererRequest>((emit) => {
				const webContentsId = ctx.senderWindow?.webContents.id;
				if (webContentsId === undefined) return () => {};
				const handler = (request: PaneLayoutRendererRequest) => {
					if (request.targetWebContentsId === webContentsId) {
						emit.next(request);
					}
				};
				paneLayoutRequests.addSubscriber(webContentsId);
				paneLayoutRequests.on("request", handler);
				return () => {
					paneLayoutRequests.off("request", handler);
					paneLayoutRequests.removeSubscriber(webContentsId);
				};
			});
		}),

		respond: publicProcedure
			.input(
				z.object({
					requestId: z.string(),
					result: z.custom<PaneLayoutOpResult>().optional(),
					error: z
						.object({
							code: z.enum(PANE_LAYOUT_ERROR_CODES).optional(),
							message: z.string(),
						})
						.optional(),
				}),
			)
			.mutation(({ ctx, input }) => {
				paneLayoutRequests.respond(
					input,
					ctx.senderWindow?.webContents.id ?? null,
				);
				return { success: true };
			}),
	});
};
