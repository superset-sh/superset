import { observable } from "@trpc/server/observable";
import { downloadManager } from "main/lib/browser/download-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createDownloadsRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			return downloadManager.list();
		}),

		// Streams the full list on every change (new download, progress tick,
		// completion) — simpler than diffing for a list capped at 200 rows.
		onChanged: publicProcedure.subscription(() => {
			return observable<ReturnType<typeof downloadManager.list>>((emit) => {
				const push = () => emit.next(downloadManager.list());
				downloadManager.on("changed", push);
				push();
				return () => {
					downloadManager.off("changed", push);
				};
			});
		}),

		cancel: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				return { cancelled: downloadManager.cancel(input.id) };
			}),

		clear: publicProcedure.mutation(() => {
			downloadManager.clear();
			return { success: true };
		}),

		showInFolder: publicProcedure
			.input(z.object({ savePath: z.string() }))
			.mutation(({ input }) => {
				downloadManager.showInFolder(input.savePath);
				return { success: true };
			}),

		openFile: publicProcedure
			.input(z.object({ savePath: z.string() }))
			.mutation(async ({ input }) => {
				const error = await downloadManager.openFile(input.savePath);
				return { success: error === "" };
			}),
	});
};
