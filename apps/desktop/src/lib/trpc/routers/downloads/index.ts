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

		// Both procedures resolve the path from the tracked download row rather
		// than trusting a renderer-supplied path, so a compromised/buggy
		// renderer can't point shell.openPath/showItemInFolder at an arbitrary
		// file on disk.
		showInFolder: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const row = downloadManager.getById(input.id);
				if (!row) return { success: false };
				downloadManager.showInFolder(row.savePath);
				return { success: true };
			}),

		openFile: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const row = downloadManager.getById(input.id);
				if (!row) return { success: false };
				const error = await downloadManager.openFile(row.savePath);
				return { success: error === "" };
			}),
	});
};
