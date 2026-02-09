import { observable } from "@trpc/server/observable";
import { fsWatcher } from "main/lib/fs-watcher";
import type { FileSystemBatchEvent } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createSubscriptionRouter = () => {
	return router({
		subscribe: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.subscription(({ input }) => {
				return observable<FileSystemBatchEvent>((emit) => {
					const onBatch = (batch: FileSystemBatchEvent) => {
						if (batch.workspaceId === input.workspaceId) {
							emit.next(batch);
						}
					};

					fsWatcher.on("batch", onBatch);

					return () => {
						fsWatcher.off("batch", onBatch);
					};
				});
			}),
	});
};
