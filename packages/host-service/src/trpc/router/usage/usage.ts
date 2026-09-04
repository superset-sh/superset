import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	leaderboardPayloadTask,
	usageHistoryTask,
} from "../../../workers/tasks/usage";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { offLoop } from "../../off-loop";
import {
	provisionClaudeAccount,
	provisionCodexAccount,
} from "./account-provisioning";
import { fetchAgyAccounts } from "./agy-quota";
import { fetchClaudeAccounts, readDefaultLoginEmail } from "./claude";
import { fetchCodexAccounts } from "./codex";
import {
	getDefaultAccountSelections,
	setDefaultAccountSelection,
} from "./default-account";
import { fetchGrokAccounts } from "./grok-quota";
import { countAgentPrsByDay } from "./history/agent-prs";
import { removeClaudeProfile, removeCodexHome } from "./profile-remove";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles";
import type { UsageAccount } from "./types";

/**
 * Agent quota endpoints are undocumented and rate-limit-sensitive, so
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
	return Promise.all([
		fetchClaudeAccounts(),
		fetchCodexAccounts(),
		fetchGrokAccounts(),
		fetchAgyAccounts(),
	]).then((groups) => groups.flat());
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
		.query(async ({ ctx, input }) => {
			const accounts = await getQuota(input?.forceRefresh ?? false);
			// isDefault is applied per query, not cached with the quota: changing
			// the default must reflect immediately without re-hitting providers.
			const defaults = getDefaultAccountSelections(ctx.db);
			return accounts.map((account) => ({
				...account,
				isDefault:
					account.agent === "claude"
						? account.selection === defaults.claudeConfigDir
						: account.agent === "codex"
							? account.selection === defaults.codexHome
							: false,
			}));
		}),

	/**
	 * Local-only login discovery (no provider network calls), safe to poll
	 * while an add-account or switch-sign-in flow is pending in a terminal.
	 * The default-slot fields let the UI notice a `/login` that re-signed the
	 * system-default login (Claude by state-file email; Codex by auth.json
	 * fingerprint, since its email is only knowable via the network).
	 */
	logins: queryProcedure.query(async () => {
		const [profiles, codexHomes, claudeDefaultEmail] = await Promise.all([
			discoverClaudeProfiles(),
			discoverCodexHomes(),
			readDefaultLoginEmail(),
		]);
		// auth.json fingerprints let the UI notice a re-login on any Codex home
		// (its email is only knowable via the network). The first home is the
		// system default.
		const codex = await Promise.all(
			codexHomes.map(async ({ home, credentialKind, loginFingerprint }) => {
				// An API-billed home's auth.json holds the raw key and is never
				// opened; its marker mtime is the fingerprint instead.
				let fingerprint = loginFingerprint;
				if (credentialKind === "subscription") {
					try {
						fingerprint = createHash("sha256")
							.update(await readFile(join(home, "auth.json")))
							.digest("hex");
					} catch {
						// No readable auth.json — fingerprint stays null.
					}
				}
				return { home, fingerprint, credentialKind };
			}),
		);
		return {
			claude: profiles.map((profile) => ({
				configDir: profile.configDir,
				email: profile.email,
				credentialKind: profile.credentialKind,
				fingerprint: profile.loginFingerprint,
			})),
			codex,
			claudeDefaultEmail,
		};
	}),

	/**
	 * Point new agent launches at one of the discovered logins (null = the
	 * system default). Never touches credentials — see default-account.ts.
	 */
	setDefaultAccount: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.selection !== null) {
				// Only accept a discovered login: the value lands in a shell env
				// overlay, and a typo'd dir would boot agents signed out.
				const accounts = await getQuota(false);
				const known = accounts.some(
					(account) =>
						account.agent === input.agent &&
						account.selection === input.selection,
				);
				if (!known) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `No ${input.agent} login found at ${input.selection} — refresh usage and pick again.`,
					});
				}
			}
			setDefaultAccountSelection(ctx.db, input.agent, input.selection);
			// A profile dir is a whole config root, not just a login: without
			// provisioning, agents launched there lose the user's skills,
			// plugins, MCP servers and settings along with Superset's lifecycle
			// hooks — and, for Claude, the shared session history. Best-effort —
			// a failed share must not undo the switch, and provisioning retries
			// on the next switch and at host boot.
			if (input.selection !== null) {
				try {
					await (input.agent === "claude"
						? provisionClaudeAccount(input.selection)
						: provisionCodexAccount(input.selection));
				} catch (error) {
					console.warn(
						`[host-service] provisioning ${input.agent} account ${input.selection} failed (continuing):`,
						error,
					);
				}
			}
			return { success: true as const };
		}),

	/**
	 * Deletes a secondary profile: its dir plus, for Claude on macOS, its
	 * scoped keychain items. The system default (selection null) is never
	 * removable, and only currently discovered profiles are accepted. A
	 * default pointer at the removed profile is cleared so agents fall back
	 * to the system login instead of a dead dir.
	 */
	removeAccount: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const accounts = await getQuota(false);
			const known = accounts.some(
				(account) =>
					account.agent === input.agent &&
					account.selection === input.selection,
			);
			if (!known) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `No removable ${input.agent} profile at ${input.selection}.`,
				});
			}
			if (input.agent === "claude") {
				await removeClaudeProfile(input.selection);
			} else {
				await removeCodexHome(input.selection);
			}
			const defaults = getDefaultAccountSelections(ctx.db);
			const pointer =
				input.agent === "claude"
					? defaults.claudeConfigDir
					: defaults.codexHome;
			if (pointer === input.selection) {
				setDefaultAccountSelection(ctx.db, input.agent, null);
			}
			// The quota cache still lists the removed account; drop it so the
			// next query re-discovers.
			cachedQuota = null;
			return { success: true as const };
		}),

	/**
	 * Preparation for a freshly added profile: share the default account's
	 * config into it (and, for Claude, mark onboarding complete), so its first
	 * agent launch opens the prompt with the user's usual setup instead of the
	 * first-boot wizard on an empty install. Only accepts discovered profile
	 * dirs.
	 */
	prepareAccount: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const discovered =
				input.agent === "claude"
					? (await discoverClaudeProfiles()).map((profile) => profile.configDir)
					: (await discoverCodexHomes()).map((home) => home.home);
			if (!discovered.includes(input.selection)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `No ${input.agent} profile found at ${input.selection}.`,
				});
			}
			await (input.agent === "claude"
				? provisionClaudeAccount(input.selection)
				: provisionCodexAccount(input.selection));
			return { success: true as const };
		}),

	/**
	 * Token/cost history estimated from the agents' own transcript logs,
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

	leaderboardPayload: queryProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object({ days: z.number().int().min(1).max(90) }))
		.query(
			offLoop({
				task: leaderboardPayloadTask,
				prepare: ({ ctx, input }) => {
					const nowMs = Date.now();
					return {
						days: input.days,
						nowMs,
						agentPrsByDay: countAgentPrsByDay(
							ctx.db,
							input.days,
							new Date(nowMs),
						),
					};
				},
				options: ({ input }) => ({
					dedupeKey: `usage-leaderboard-payload:${input.days}`,
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
export type {
	LeaderboardDay,
	LeaderboardPayload,
} from "./history/leaderboard-days";
export type {
	ModelProvider,
	QuotaCapableAgent,
	UsageAccount,
	UsageAccountCredentialKind,
	UsageAgent,
	UsageQuotaWindow,
} from "./types";
