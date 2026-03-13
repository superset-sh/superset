import { observable } from "@trpc/server/observable";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { subscribeRegisteredGitMetadataEvents } from "../workspace-fs-service";

function isClosedStreamError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		"code" in error &&
		error.code === "ERR_INVALID_STATE"
	);
}

export const createGitMetadataRouter = () => {
	return router({
		subscribeGitMetadata: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.subscription(({ input }) => {
				return observable<FileSystemChangeEvent>((emit) => {
					let isDisposed = false;
					let cleanup: (() => Promise<void>) | null = null;

					const runCleanup = () => {
						isDisposed = true;
						if (!cleanup) {
							return;
						}

						const currentCleanup = cleanup;
						cleanup = null;
						void currentCleanup().catch((error) => {
							console.error("[changes/subscribeGitMetadata] Cleanup failed:", {
								worktreePath: input.worktreePath,
								error,
							});
						});
					};

					const safeNext = (event: FileSystemChangeEvent) => {
						if (isDisposed) {
							return;
						}

						try {
							emit.next(event);
						} catch (error) {
							if (isClosedStreamError(error)) {
								runCleanup();
								return;
							}

							throw error;
						}
					};

					void subscribeRegisteredGitMetadataEvents(
						input.worktreePath,
						(event) => {
							safeNext(event);
						},
					)
						.then((unsubscribe) => {
							if (isDisposed) {
								void unsubscribe().catch((error) => {
									console.error(
										"[changes/subscribeGitMetadata] Late cleanup failed:",
										{
											worktreePath: input.worktreePath,
											error,
										},
									);
								});
								return;
							}

							cleanup = unsubscribe;
						})
						.catch((error) => {
							console.error("[changes/subscribeGitMetadata] Failed:", {
								worktreePath: input.worktreePath,
								error,
							});
							safeNext({
								type: "overflow",
								revision: 0,
							});
						});

					return () => {
						runCleanup();
					};
				});
			}),
	});
};
