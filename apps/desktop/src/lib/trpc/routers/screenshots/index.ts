import { observable } from "@trpc/server/observable";
import { screenshotManager } from "main/lib/browser/screenshot-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createScreenshotsRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			return screenshotManager.list();
		}),

		onChanged: publicProcedure.subscription(() => {
			return observable<ReturnType<typeof screenshotManager.list>>((emit) => {
				const push = () => emit.next(screenshotManager.list());
				screenshotManager.on("changed", push);
				push();
				return () => {
					screenshotManager.off("changed", push);
				};
			});
		}),

		clear: publicProcedure.mutation(() => {
			screenshotManager.clear();
			return { success: true };
		}),

		// Resolves the path from the tracked row rather than trusting a
		// renderer-supplied path, matching the downloads router.
		showInFolder: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const row = screenshotManager.getById(input.id);
				if (!row) return { success: false };
				screenshotManager.showInFolder(row.savePath);
				return { success: true };
			}),

		openFile: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const row = screenshotManager.getById(input.id);
				if (!row) return { success: false };
				const error = await screenshotManager.openFile(row.savePath);
				return { success: error === "" };
			}),
	});
};
