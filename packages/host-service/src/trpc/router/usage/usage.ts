import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { quotaEntryKey } from "../../../account-engine/quota-store.ts";
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
import { readDefaultLoginEmail } from "./claude";
import {
	applyAccountEngineState,
	isActiveAccount,
	readAccountEngineView,
	setDefaultAccountSelection,
} from "./default-account";
import {
	engineError,
	engineStateUnusable,
	usageEngineRouter,
	writableEngine,
} from "./engine";
import { countAgentPrsByDay } from "./history/agent-prs";
import { removeClaudeProfile, removeCodexHome } from "./profile-remove";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles";
import type { UsageAccount } from "./types";

export const usageRouter = router({
	/** U7: the account engine's settings, rotation and switch history. */
	engine: usageEngineRouter,

	quota: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(z.object({ forceRefresh: z.boolean().optional() }).optional())
		.query(async ({ ctx, input }) => {
			const accounts = await ctx.runtime.quotaStore.read({
				forceRefresh: input?.forceRefresh ?? false,
			});
			// The active account and the rotation flags are applied per query,
			// not cached with the quota: a switch or a toggle must reflect
			// immediately without re-hitting providers.
			const engineState = readAccountEngineView(ctx.db);
			return accounts.map((account) =>
				applyAccountEngineState(account, engineState),
			);
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
	 * R2/R4: make one of the discovered logins the active account (null = the
	 * system default, KTD14). The engine performs it by the same path an
	 * automatic switch takes, so it reaches running sessions, records a manual
	 * history entry and restarts the cooldown while auto-switch stays on.
	 * On Windows, where there is no engine swap to be had (KTD13), it falls
	 * back to the pointer write, which is all this endpoint ever did before.
	 */
	setDefaultAccount: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const engine = ctx.runtime.accountEngine;
			// KTD13: the engine's hot swap is POSIX-only, but the pointer it
			// repoints is not. On Windows, picking the login new sessions
			// launch on still works exactly as it did before the engine
			// existed — the panel says so, so it must be true.
			// The same is true of a host whose engine state dir is unusable: no
			// engine sharing that dir can claim the lock, so there is no hot
			// swap to be had — but the pointer is a DB write that needs no
			// state dir, so choosing which login new sessions launch on still
			// works. Only the swap of already-running sessions is lost.
			if (
				engine &&
				(!engine.status()[input.agent].platformSupported ||
					engineStateUnusable())
			) {
				if (input.selection !== null) {
					// Only accept a discovered login: the value lands in a shell
					// env overlay, and a typo'd dir would boot agents signed out.
					const accounts = await ctx.runtime.quotaStore.read({
						agents: [input.agent],
					});
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
			} else {
				// A lock loser must not swap behind the owner's back (KTD5).
				// The engine itself refuses an account it cannot see, so no
				// separate known-login check is needed.
				const outcome = await writableEngine(engine).switchManually(
					input.agent,
					input.selection,
				);
				if (!outcome.ok) throw engineError(outcome.code);
			}
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
	 * removable, and only currently discovered profiles are accepted. R25:
	 * the active account is what every running session is signed in as, so it
	 * can only be removed once another account has become active.
	 */
	removeAccount: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// KTD5: the mutation lane below only serialises this host-service.
			// On a lock loser the instance that owns the lock can switch onto
			// this profile at any moment, and a deleted profile dir is not
			// recoverable — so removal happens on the owner or not at all. A
			// sandbox has no engine and keeps the unserialised path.
			// An unusable state dir answers false to the same question, and
			// there the hazard is absent rather than present: no engine
			// sharing that dir can claim the lock, so none can switch onto
			// this profile. Refusing on it would make the profile permanently
			// undeletable; `refuseIfActive` below is what actually guards the
			// rm, and it reads the pointer and the runtime, not the lock. The
			// dir is host configuration rather than a racing lock, so it is
			// read once per request while the lock itself is re-read below.
			let unusable: boolean | undefined;
			const foreignLockHeld = (): boolean => {
				if (ctx.runtime.accountEngine?.ownsLock() !== false) return false;
				if (unusable === undefined) unusable = engineStateUnusable();
				return !unusable;
			};
			if (foreignLockHeld()) {
				throw engineError("lock-loser");
			}
			const accounts = await ctx.runtime.quotaStore.read({
				agents: [input.agent],
			});
			const target = accounts.find(
				(account) =>
					account.agent === input.agent &&
					(account.selection === input.selection ||
						account.duplicateSelections?.includes(input.selection) === true),
			);
			if (!target) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `No removable ${input.agent} profile at ${input.selection}.`,
				});
			}
			const refuseIfActive = (account: UsageAccount): void => {
				const engineStatus = ctx.runtime.accountEngine?.status()[input.agent];
				const view = readAccountEngineView(ctx.db);
				// The row can own more than one dir, and the request names one of
				// them — so the guard has to test the dir being deleted, not just
				// the row's surviving selection. Otherwise removing a duplicate
				// dir that the pointer happens to name deletes the login every
				// running session is signed in to: the identity branches below
				// only catch it once the engine has recorded an activeAccountId,
				// which it never has on Windows, in a sandbox, or after a pointer
				// migrated from the pre-engine setting.
				const requestedIsLive =
					input.selection !== null &&
					(input.selection === view[input.agent]?.pointerSelection ||
						input.selection === engineStatus?.activeSelection);
				const active =
					requestedIsLive ||
					isActiveAccount(account, view) ||
					(engineStatus?.activeAccountId != null &&
						account.accountId === engineStatus.activeAccountId) ||
					(engineStatus?.activeSelection != null &&
						account.selection === engineStatus.activeSelection);
				if (!active) return;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `This is the active ${input.agent} account — switch to another account first, then remove it.`,
				});
			};
			refuseIfActive(target);
			// A switch can land between the check above and the delete below —
			// they are separated by awaits — and removing the dir every running
			// session is signed in to is not recoverable. Both reads are cheap
			// and neither hits a provider, so the check is repeated on fresh
			// state as the last thing before the filesystem.
			const recheckAndDelete = async (): Promise<void> => {
				const current = (
					await ctx.runtime.quotaStore.read({ agents: [input.agent] })
				).find(
					(account) =>
						account.agent === input.agent &&
						(account.selection === input.selection ||
							account.duplicateSelections?.includes(input.selection) === true),
				);
				refuseIfActive(current ?? target);
				// The lane serialises this host-service only. Re-read the lock from
				// disk here, the way every engine mutation re-checks at an awaited
				// boundary — a switch that has swapped but not yet persisted its
				// runtime is invisible to the check above, and the owner is the one
				// that made it.
				if (foreignLockHeld()) {
					throw engineError("lock-loser");
				}
				if (input.agent === "claude") {
					await removeClaudeProfile(input.selection);
				} else {
					await removeCodexHome(input.selection);
				}
			};
			// On the engine's mutation lane, so a switch already queued there
			// finishes before the re-check reads the active account, and one
			// that arrives later waits for the delete. This serialises within
			// one host-service only; across processes nothing stops the lock
			// owner switching under us, which is why the delete re-reads the
			// lock above. A sandbox has no engine and keeps the unserialised
			// path.
			const engine = ctx.runtime.accountEngine;
			await (engine
				? engine.runExclusive(recheckAndDelete)
				: recheckAndDelete());
			// The store still lists the removed account; drop its entry so the
			// next read re-discovers.
			ctx.runtime.quotaStore.invalidate(
				quotaEntryKey(input.agent, input.selection),
			);
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
