import { basename } from "node:path";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { usageHistoryTask } from "../../../workers/tasks/usage";
import { queryProcedure, router } from "../../index";
import { offLoop } from "../../off-loop";
import { fetchClaudeAccounts } from "./claude";
import { fetchCodexAccounts } from "./codex";
import type { UsageAccount } from "./types";

/**
 * Provider quota endpoints are undocumented and rate-limit-sensitive, so
 * results are cached briefly and concurrent callers share one in-flight
 * request. The cached promise is evicted on rejection so a failure does not
 * replay for the whole TTL.
 */
// >=5 min: Anthropic 429-blacklists faster pollers of the oauth/usage
// endpoint (ccusage deprecated its live gauge over this; CodexBar #30930).
const QUOTA_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedQuota: { promise: Promise<UsageAccount[]>; cachedAt: number } | null =
	null;

function loadAccounts(): Promise<UsageAccount[]> {
	return Promise.all([fetchClaudeAccounts(), fetchCodexAccounts()]).then(
		(groups) => groups.flat(),
	);
}

function getQuota(forceRefresh: boolean): Promise<UsageAccount[]> {
	if (
		!forceRefresh &&
		cachedQuota &&
		Date.now() - cachedQuota.cachedAt < QUOTA_CACHE_TTL_MS
	) {
		return cachedQuota.promise;
	}

	const promise = loadAccounts();
	const entry = { promise, cachedAt: Date.now() };
	cachedQuota = entry;
	promise.catch(() => {
		if (cachedQuota === entry) cachedQuota = null;
	});
	return promise;
}

export const usageRouter = router({
	quota: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(z.object({ forceRefresh: z.boolean().optional() }).optional())
		.query(({ input }) => getQuota(input?.forceRefresh ?? false)),

	/**
	 * Token/cost history estimated from the providers' own transcript logs,
	 * priced at API list rates. Runs in the worker pool — the transcript
	 * trees reach multiple GB. Coalesced per window so concurrent callers
	 * (and the renderer's poll) share one scan.
	 */
	history: queryProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object({ days: z.number().int().min(1).max(90) }))
		.query(
			offLoop({
				task: usageHistoryTask,
				// Workspace/project rows from host.db let the worker attribute
				// transcript cwds to real workspaces instead of guessing from
				// directory names.
				prepare: ({ ctx, input }) => {
					const workspaceRows = ctx.db
						.select({
							worktreePath: workspaces.worktreePath,
							name: workspaces.name,
							projectId: workspaces.projectId,
						})
						.from(workspaces)
						.all();
					const projectRows = ctx.db
						.select({
							id: projects.id,
							repoPath: projects.repoPath,
							name: projects.name,
						})
						.from(projects)
						.all();
					const projectNameById = new Map(
						projectRows.map((row) => [
							row.id,
							row.name || basename(row.repoPath),
						]),
					);
					const cwdLabels = [
						...workspaceRows.map((row) => ({
							prefix: row.worktreePath,
							label: row.name || basename(row.worktreePath),
							kind: "workspace" as const,
							group: row.projectId
								? (projectNameById.get(row.projectId) ?? null)
								: null,
						})),
						// A repo checkout groups with its own project so the project
						// rollup includes work done directly in the main checkout.
						...projectRows.map((row) => {
							const label = row.name || basename(row.repoPath);
							return {
								prefix: row.repoPath,
								label,
								kind: "project" as const,
								group: label,
							};
						}),
					].filter((label) => label.prefix);
					return { days: input.days, cwdLabels };
				},
				options: ({ input }) => ({
					dedupeKey: `usage-history:${input.days}`,
					timeoutMs: 110_000,
				}),
			}),
		),
});

export type {
	UsageDailyBucket,
	UsageHistory,
	UsageModelBreakdown,
	UsageProjectBreakdown,
} from "./history/aggregate";
export type { UsageAccount, UsageProvider, UsageQuotaWindow } from "./types";
