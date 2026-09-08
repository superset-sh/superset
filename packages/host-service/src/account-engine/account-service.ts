import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import {
	provisionClaudeAccount,
	provisionCodexAccount,
} from "../trpc/router/usage/account-provisioning.ts";
import {
	type AccountEngineView,
	activeClaudeConfigDirPath,
	type DefaultAccountSelections,
	getMachineAccountSelections,
	isActiveAccount,
	readMachineAccountEngineView,
	setMachineAccountSelection,
} from "../trpc/router/usage/default-account.ts";
import {
	removeClaudeProfile,
	removeCodexHome,
} from "../trpc/router/usage/profile-remove.ts";
import {
	discoverClaudeProfiles,
	discoverCodexHomes,
	readClaudeIdentity,
} from "../trpc/router/usage/profiles.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import type {
	AccountEngine,
	AgentEngineStatus,
	ManualSwitchOutcome,
	RotationOutcome,
	SettingsOutcome,
} from "./account-engine.ts";
import { defaultEngineSettings, EngineState } from "./engine-state.ts";
import {
	type QuotaReadOptions,
	type QuotaStore,
	quotaEntryKey,
} from "./quota-store.ts";
import type {
	AccountAgent,
	AutoSwitchSettings,
	EngineSettings,
	HistoryEntry,
} from "./types.ts";

export interface AccountSelectionInput {
	agent: AccountAgent;
	selection: string;
}
export interface AccountRemovalInput extends AccountSelectionInput {
	acknowledgeUnknownActive?: boolean;
}
/** Async, serializable boundary between org hosts and the machine owner. */
export interface AccountService {
	status(): Promise<Record<AccountAgent, AgentEngineStatus>>;
	getSettings(): Promise<EngineSettings>;
	setSettings(
		agent: AccountAgent,
		patch: Partial<AutoSwitchSettings>,
	): Promise<SettingsOutcome>;
	setRotation(
		accountKey: string,
		inRotation: boolean,
	): Promise<RotationOutcome>;
	history(limit?: number): Promise<HistoryEntry[]>;
	ownsLock(): Promise<boolean>;
	switchManually(
		agent: AccountAgent,
		selection: string | null,
	): Promise<ManualSwitchOutcome>;
	readUsage(options?: QuotaReadOptions): Promise<UsageAccount[]>;
	removeAccount(input: AccountRemovalInput): Promise<{ success: true }>;
	prepareAccount(input: AccountSelectionInput): Promise<{ success: true }>;
	provisionSelectedAccounts(): Promise<void>;
}

export interface AccountServicePointers {
	readView(): AccountEngineView;
	setSelection(agent: AccountAgent, selection: string | null): void;
	getSelections(): DefaultAccountSelections;
}

function engineError(code: string): TRPCError {
	return new TRPCError({ code: "PRECONDITION_FAILED", message: code });
}
function engineStateUnusable(): boolean {
	return new EngineState().assertSafeStateDir().readOnly;
}
function requireWritableEngine(engine: AccountEngine | null): AccountEngine {
	if (!engine) throw engineError("engine-unavailable");
	if (engine.status().claude.platformSupported && !engine.ownsLock()) {
		throw engineError(
			engineStateUnusable() ? "engine-state-unusable" : "lock-loser",
		);
	}
	return engine;
}

export function createLocalAccountService(
	engine: AccountEngine | null,
	quotaStore: QuotaStore,
	pointers: AccountServicePointers = {
		readView: readMachineAccountEngineView,
		setSelection: setMachineAccountSelection,
		getSelections: getMachineAccountSelections,
	},
): AccountService {
	const exclusive = <T>(operation: () => Promise<T>): Promise<T> =>
		engine ? engine.runExclusive(operation) : operation();
	const requireCredentialOwner = (): void => {
		if (engine && !engineStateUnusable()) requireWritableEngine(engine);
	};
	return {
		async status() {
			if (engine) return engine.status();
			const status: AgentEngineStatus = {
				enabled: false,
				activeAccountId: null,
				activeSelection: null,
				cooldownUntil: null,
				exhausted: false,
				lockOwner: false,
				platformSupported: process.platform !== "win32",
			};
			return { claude: status, codex: { ...status } };
		},
		async getSettings() {
			return engine?.getSettings() ?? defaultEngineSettings();
		},
		async setSettings(agent, patch) {
			return requireWritableEngine(engine).setSettings(agent, patch);
		},
		async setRotation(accountKey, inRotation) {
			return requireWritableEngine(engine).setRotation(accountKey, inRotation);
		},
		async history(limit) {
			return engine?.history(limit) ?? [];
		},
		async ownsLock() {
			return engine?.ownsLock() ?? false;
		},
		readUsage: (options) => quotaStore.read(options),
		async switchManually(agent, selection) {
			const input = { agent, selection };

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
					const accounts = await quotaStore.read({
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
				pointers.setSelection(input.agent, input.selection);
			} else {
				// A lock loser must not swap behind the owner's back (KTD5).
				// The engine itself refuses an account it cannot see, so no
				// separate known-login check is needed.
				const outcome = await requireWritableEngine(engine).switchManually(
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
					const selection = input.selection;
					await exclusive(async () => {
						requireCredentialOwner();
						await (input.agent === "claude"
							? provisionClaudeAccount(selection)
							: provisionCodexAccount(selection));
					});
				} catch (error) {
					console.warn(
						`[host-service] provisioning ${input.agent} account ${input.selection} failed (continuing):`,
						error,
					);
				}
			}
			return { ok: true as const };
		},
		async removeAccount(input) {
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
				if (engine?.ownsLock() !== false) return false;
				if (unusable === undefined) unusable = engineStateUnusable();
				return !unusable;
			};
			if (foreignLockHeld()) {
				throw engineError("lock-loser");
			}
			const accounts = await quotaStore.read({
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
			const activeAccountRefusal = (): TRPCError =>
				new TRPCError({
					code: "BAD_REQUEST",
					message: `This is the active ${input.agent} account — switch to another account first, then remove it.`,
				});
			const refuseIfActive = async (account: UsageAccount): Promise<void> => {
				const engineStatus = engine?.status()[input.agent];
				const view = pointers.readView();
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
				if (active) throw activeAccountRefusal();
				// KTD4: the pointer names the active dir and nothing recorded
				// which login was swapped into it, so every test above compared
				// against null and answered "not active" — including
				// `isActiveAccount`, which deliberately shows no badge rather
				// than a wrong one. `engine.status()` is no second witness: it
				// reads the same runtime record. That state is permanent on a
				// host whose engine state dir is unusable, so refusing outright
				// would leave every profile undeletable, with no switch
				// available to make one of them removable either.
				// The active dir's own `.claude.json` still says whose login is
				// in it — the same read the engine's `pointerAccount` falls back
				// to when the pointer names that dir — and it lives outside the
				// state dir, so an unusable one keeps it available.
				// Only Claude has such a dir; Codex's pointer names the profile
				// home itself, so its binding is never `unknown`.
				if (input.agent !== "claude" || !view.claude.unknown) return;
				const live = await readClaudeIdentity(activeClaudeConfigDirPath());
				if (live?.accountId != null) {
					if (live.accountId === account.accountId) {
						throw activeAccountRefusal();
					}
					return;
				}
				// Nobody can say which login is live. Deleting blind is the one
				// unrecoverable outcome, so refuse — but with a code of its own
				// so the UI can offer the removal behind an explicit
				// acknowledgement instead of stranding the user.
				if (input.acknowledgeUnknownActive === true) return;
				throw engineError("active-account-unknown");
			};
			await refuseIfActive(target);
			// A switch can land between the check above and the delete below —
			// they are separated by awaits — and removing the dir every running
			// session is signed in to is not recoverable. Both reads are cheap
			// and neither hits a provider, so the check is repeated on fresh
			// state as the last thing before the filesystem.
			const recheckAndDelete = async (): Promise<void> => {
				const current = (await quotaStore.read({ agents: [input.agent] })).find(
					(account) =>
						account.agent === input.agent &&
						(account.selection === input.selection ||
							account.duplicateSelections?.includes(input.selection) === true),
				);
				await refuseIfActive(current ?? target);
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

			await (engine
				? engine.runExclusive(recheckAndDelete)
				: recheckAndDelete());
			// The store still lists the removed account; drop its entry so the
			// next read re-discovers.
			quotaStore.invalidate(quotaEntryKey(input.agent, input.selection));
			return { success: true as const };
		},
		async prepareAccount(input) {
			return exclusive(async () => {
				requireCredentialOwner();
				const discovered =
					input.agent === "claude"
						? (await discoverClaudeProfiles()).map(
								(profile) => profile.configDir,
							)
						: (await discoverCodexHomes()).map((home) => home.home);
				if (!discovered.includes(input.selection))
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `No ${input.agent} profile found at ${input.selection}.`,
					});
				requireCredentialOwner();
				await (input.agent === "claude"
					? provisionClaudeAccount(input.selection)
					: provisionCodexAccount(input.selection));
				return { success: true as const };
			});
		},
		async provisionSelectedAccounts() {
			return exclusive(async () => {
				requireCredentialOwner();
				const { claudeConfigDir, codexHome } = pointers.getSelections();
				for (const [selection, provision] of [
					[claudeConfigDir, provisionClaudeAccount],
					[codexHome, provisionCodexAccount],
				] as const) {
					if (!selection || !existsSync(selection)) continue;
					requireCredentialOwner();
					try {
						await provision(selection);
					} catch (error) {
						console.warn(
							`[host-service] provisioning account ${selection} failed (continuing):`,
							error,
						);
					}
				}
			});
		},
	};
}
