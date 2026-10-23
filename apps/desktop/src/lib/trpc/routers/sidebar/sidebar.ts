import {
	SIDEBAR_REQUEST_ERROR_CODES,
	type SidebarFolderPruneResult,
} from "@superset/shared/sidebar-folders";
import { observable } from "@trpc/server/observable";
import {
	type SidebarRendererRequest,
	sidebarRequests,
} from "main/lib/sidebar/sidebar-requests";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createSidebarRouter = () => {
	return router({
		// Sidebar requests from the CLI (via the bridge), scoped to the one
		// window main picked for each request.
		onRequest: publicProcedure.subscription(({ ctx }) => {
			return observable<SidebarRendererRequest>((emit) => {
				const window = ctx.senderWindow;
				if (!window) return () => {};
				const webContentsId = window.webContents.id;
				const handler = (request: SidebarRendererRequest) => {
					if (request.targetWebContentsId === webContentsId) {
						emit.next(request);
					}
				};
				sidebarRequests.addSubscriber(webContentsId, window.id);
				sidebarRequests.on("request", handler);
				return () => {
					sidebarRequests.off("request", handler);
					sidebarRequests.removeSubscriber(webContentsId);
				};
			});
		}),

		respond: publicProcedure
			.input(
				z.object({
					requestId: z.string(),
					result: z.custom<SidebarFolderPruneResult>().optional(),
					error: z
						.object({
							code: z.enum(SIDEBAR_REQUEST_ERROR_CODES).optional(),
							message: z.string(),
						})
						.optional(),
				}),
			)
			.mutation(({ ctx, input }) => {
				sidebarRequests.respond(
					input,
					ctx.senderWindow?.webContents.id ?? null,
				);
				return { success: true };
			}),
	});
};
