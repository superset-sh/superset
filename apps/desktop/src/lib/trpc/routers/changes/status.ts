import { TRPCError } from "@trpc/server";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { assertRegisteredWorktree } from "./security";
import {
	clearInFlightStatus,
	getCachedStatus,
	getInFlightStatus,
	makeStatusCacheKey,
	setCachedStatus,
	setInFlightStatus,
} from "./utils/status-cache";
import { runGitTask } from "./workers/git-task-runner";

export const createStatusRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				assertRegisteredWorktree(input.worktreePath);

				const defaultBranch = input.defaultBranch || "main";
				const cacheKey = makeStatusCacheKey(input.worktreePath, defaultBranch);
				const cached = getCachedStatus(cacheKey);
				if (cached) {
					return cached;
				}

				const inFlight = getInFlightStatus(cacheKey);
				if (inFlight) {
					return inFlight;
				}

				let statusPromise!: Promise<GitChangesStatus>;
				statusPromise = (async (): Promise<GitChangesStatus> => {
					try {
						const result = await runGitTask(
							"getStatus",
							{
								worktreePath: input.worktreePath,
								defaultBranch,
							},
							{
								timeoutMs: 45_000,
							},
						);

						// Guard against stale in-flight completion after explicit invalidation.
						if (getInFlightStatus(cacheKey) === statusPromise) {
							setCachedStatus(cacheKey, result);
						}
						return result;
					} catch (error) {
						if (error instanceof Error && error.name === "NotGitRepoError") {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: error.message,
							});
						}
						throw error;
					}
				})();

				setInFlightStatus(cacheKey, statusPromise);
				try {
					return await statusPromise;
				} finally {
					if (getInFlightStatus(cacheKey) === statusPromise) {
						clearInFlightStatus(cacheKey);
					}
				}
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				assertRegisteredWorktree(input.worktreePath);

				try {
					return await runGitTask(
						"getCommitFiles",
						{
							worktreePath: input.worktreePath,
							commitHash: input.commitHash,
						},
						{
							dedupeKey: `${input.worktreePath}:${input.commitHash}`,
							strategy: "coalesce",
							timeoutMs: 30_000,
						},
					);
				} catch (error) {
					if (error instanceof Error && error.name === "NotGitRepoError") {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: error.message,
						});
					}
					throw error;
				}
			}),
	});
};
