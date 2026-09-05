/**
 * Moves a Claude login into the Superset-owned active config dir, so running
 * Claude Code sessions change account without a relaunch (the CLI re-reads its
 * credential store when it changes). Profile dirs stay the vault of logins:
 * this is the only place that writes one, and it writes only
 * `claudeAiOauth` — never a refresh, never a network call, never a token in a
 * log line or in argv.
 *
 * The protocol, in order, is what makes a swap atomic from a session's point
 * of view (a failure before the verify step leaves the previous login in
 * place):
 *
 *  1. validate the target's store dir and read its login and identity;
 *  2. read the login currently in the active dir — the owner's, refreshed by
 *     the CLI since it was last saved;
 *  3. validate the owner's store and save that login back into it, never
 *     regressing a newer one, keeping three capped 0600 backups;
 *  4. re-validate the active dir, re-hash the source (one retry if it moved),
 *     write the target's `claudeAiOauth` preserving `mcpOAuth`, then swap the
 *     identity block in `.claude.json` preserving onboarding and trust;
 *  5. read both back and verify they are the target's.
 *
 * The owner is named by the caller (the engine's identity-to-dir binding);
 * this primitive never scans for it, records no history and moves no pointer.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
	lstat,
	readdir,
	readFile,
	realpath,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { updateClaudeStateFile } from "../trpc/router/usage/claude-state-file";
import {
	CLAUDE_DEFAULT_KEYCHAIN_SERVICE,
	type ClaudeCredentialJson,
	type ClaudeLoginRead,
	claudeKeychainAccounts,
	claudeStatePath,
	keychainServicesForConfigDir,
	readClaudeLogin,
	readKeychainAccountAttribute,
	runSecurity,
	type SecurityExec,
} from "../trpc/router/usage/profiles";

/** A login store: a profile config dir, or the system default (`~/.claude`,
 * whose identity lives next door at `~/.claude.json`). */
export type ClaudeLoginStoreRef =
	| { kind: "profile"; dir: string }
	| { kind: "system-default" };

export interface ClaudeSwapIdentity {
	accountUuid: string | null;
	emailAddress: string | null;
	/** The identity keys copied verbatim into the active dir's state file. */
	keys: Record<string, unknown>;
}

export type ClaudeSwapFailureCode =
	| "owner-unknown"
	| "invalid-target"
	| "invalid-owner"
	| "invalid-active-dir"
	| "no-target-login"
	| "no-target-identity"
	| "source-changed"
	| "keychain-ambiguous"
	| "write-failed"
	| "verify-failed";

export type ClaudeSwapResult =
	| { ok: true; identity: ClaudeSwapIdentity }
	| { ok: false; code: ClaudeSwapFailureCode; reason: string };

/** The fs surface the swap writes through, injectable so failure paths (and
 * the Keychain path off macOS) are unit-testable. */
export interface SwapFileSystem {
	lstat(path: string): Promise<Stats>;
	stat(path: string): Promise<Stats>;
	realpath(path: string): Promise<string>;
	readFile(path: string, encoding: "utf-8"): Promise<string>;
	writeFile(
		path: string,
		data: string,
		options: { mode: number; flag: string },
	): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	unlink(path: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
}

export interface ClaudeSwapDeps {
	fs?: Partial<SwapFileSystem>;
	exec?: SecurityExec;
	darwin?: boolean;
	homeDir?: string;
	supersetHomeDir?: string;
	uid?: number;
	now?: () => number;
}

interface SwapContext extends Required<Omit<ClaudeSwapDeps, "fs">> {
	fs: SwapFileSystem;
}

/** Identity keys `.claude.json` holds for the signed-in account — deleted by
 * name on a swap so no key of the previous account survives. */
const CLAUDE_IDENTITY_KEYS = ["oauthAccount", "userID"] as const;
const BACKUP_MARKER = ".superset-swap-bak";
const MAX_BACKUPS_PER_DIR = 3;
const KEYCHAIN_ACCOUNT_FALLBACK = "claude-code-user";

/** Mirror of agent-setup's resolveSupersetHomeDir; see default-account.ts for
 * why this module does not import the agent-setup surface. */
function defaultSupersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
}

function buildContext(deps: ClaudeSwapDeps = {}): SwapContext {
	return {
		fs: {
			lstat,
			stat,
			realpath,
			readFile,
			writeFile,
			rename,
			unlink,
			readdir,
			...deps.fs,
		} as SwapFileSystem,
		exec: deps.exec ?? runSecurity,
		darwin: deps.darwin ?? process.platform === "darwin",
		homeDir: deps.homeDir ?? homedir(),
		supersetHomeDir: deps.supersetHomeDir ?? defaultSupersetHomeDir(),
		uid: deps.uid ?? process.getuid?.() ?? 0,
		now: deps.now ?? Date.now,
	};
}

function failure(
	code: ClaudeSwapFailureCode,
	reason: string,
): ClaudeSwapResult {
	return { ok: false, code, reason };
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function storeDir(ref: ClaudeLoginStoreRef, ctx: SwapContext): string {
	return ref.kind === "profile" ? ref.dir : join(ctx.homeDir, ".claude");
}

function configDirOf(ref: ClaudeLoginStoreRef): string | null {
	return ref.kind === "profile" ? ref.dir : null;
}

function isInside(path: string, base: string): boolean {
	return path === base || path.startsWith(`${base}${sep}`);
}

/**
 * A dir Superset may write a credential into: a real directory (never a
 * symlink — Claude Code opens `.credentials.json` with O_NOFOLLOW and a
 * swapped-in link is how another user would read the token), owned by this
 * user, not group- or other-writable, and inside `$HOME` or
 * `$SUPERSET_HOME_DIR`. Re-run immediately before every write.
 */
async function validateDir(
	dir: string,
	ctx: SwapContext,
): Promise<string | null> {
	let real: string;
	try {
		real = await ctx.fs.realpath(dir);
	} catch (error) {
		return `${dir} cannot be resolved (${errorText(error)})`;
	}
	const info = await ctx.fs.lstat(dir).catch(() => null);
	if (!info?.isDirectory()) return `${dir} is not a directory`;
	if (info.uid !== ctx.uid) return `${dir} is not owned by this user`;
	if ((info.mode & 0o022) !== 0) return `${dir} is group- or other-writable`;
	if (!isInside(real, ctx.homeDir) && !isInside(real, ctx.supersetHomeDir)) {
		return `${dir} is outside the home and Superset home dirs`;
	}
	return null;
}

async function readStore(
	ref: ClaudeLoginStoreRef,
	ctx: SwapContext,
): Promise<ClaudeLoginRead> {
	return readClaudeLogin(configDirOf(ref), {
		exec: ctx.exec,
		darwin: ctx.darwin,
		homeDir: ctx.homeDir,
		readFile: ctx.fs.readFile,
	});
}

type Oauth = Record<string, unknown>;

/** Stable over key order, so a rewrite that only reorders keys is not read as
 * a concurrent login change. */
function hashOauth(oauth: Oauth | undefined): string {
	if (!oauth) return "";
	return createHash("sha256")
		.update(JSON.stringify(oauth, Object.keys(oauth).sort()))
		.digest("hex");
}

function oauthOf(read: ClaudeLoginRead): Oauth | undefined {
	return read.login?.claudeAiOauth;
}

function timestamp(oauth: Oauth | undefined, key: string): number {
	const value = oauth?.[key];
	return typeof value === "number" ? value : 0;
}

/** True when the store already holds a login at least as fresh as the one
 * about to be saved back — writing then would sign that account out. */
function wouldRegress(stored: Oauth | undefined, incoming: Oauth): boolean {
	if (!stored) return false;
	for (const key of ["expiresAt", "refreshTokenExpiresAt"]) {
		if (timestamp(stored, key) > timestamp(incoming, key)) return true;
	}
	return false;
}

function extractIdentity(
	state: Record<string, unknown> | null,
): ClaudeSwapIdentity | null {
	if (!state) return null;
	const keys: Record<string, unknown> = {};
	for (const key of CLAUDE_IDENTITY_KEYS) {
		if (key in state) keys[key] = state[key];
	}
	const account = state.oauthAccount as
		| { accountUuid?: unknown; emailAddress?: unknown }
		| undefined;
	const accountUuid =
		typeof account?.accountUuid === "string" ? account.accountUuid : null;
	const emailAddress =
		typeof account?.emailAddress === "string" ? account.emailAddress : null;
	if (!accountUuid && !emailAddress) return null;
	return { accountUuid, emailAddress, keys };
}

async function readIdentity(
	statePath: string,
	ctx: SwapContext,
): Promise<ClaudeSwapIdentity | null> {
	try {
		const parsed: unknown = JSON.parse(
			await ctx.fs.readFile(statePath, "utf-8"),
		);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		return extractIdentity(parsed as Record<string, unknown>);
	} catch {
		return null;
	}
}

/** One 0600 timestamped copy per write, three kept per dir. Best-effort: a
 * failed backup must not stop a swap the user is waiting on. */
async function backupCredentialFile(
	path: string,
	previous: ClaudeCredentialJson,
	ctx: SwapContext,
): Promise<void> {
	const stamp = new Date(ctx.now()).toISOString().replace(/[:.]/g, "-");
	try {
		await ctx.fs.writeFile(
			`${path}.${stamp}${BACKUP_MARKER}`,
			JSON.stringify(previous),
			{ mode: 0o600, flag: "wx" },
		);
	} catch {
		return;
	}
	try {
		const prefix = `${basename(path)}.`;
		const existing = (await ctx.fs.readdir(dirname(path)))
			.filter((name) => name.startsWith(prefix) && name.endsWith(BACKUP_MARKER))
			.sort();
		for (const name of existing.slice(0, -MAX_BACKUPS_PER_DIR)) {
			await ctx.fs.unlink(join(dirname(path), name)).catch(() => {});
		}
	} catch {
		// Pruning is best-effort too.
	}
}

async function writeCredentialFile(
	path: string,
	content: ClaudeCredentialJson,
	ctx: SwapContext,
): Promise<void> {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await ctx.fs.writeFile(temporaryPath, JSON.stringify(content, null, 2), {
			mode: 0o600,
			flag: "wx",
		});
		// Rename replaces whatever sits there, a symlink included, with this
		// real file — which is the only shape Claude Code will open.
		await ctx.fs.rename(temporaryPath, path);
	} catch (error) {
		await ctx.fs.unlink(temporaryPath).catch(() => {});
		throw error;
	}
}

/** `security -i` quoting: the secret travels on stdin, so it never reaches
 * argv, and the JSON has to survive security's own tokenizer. */
function quoteSecurityArg(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function writeKeychainItem(
	item: { service: string; account: string },
	content: ClaudeCredentialJson,
	ctx: SwapContext,
): Promise<void> {
	const command = [
		"add-generic-password",
		"-U",
		"-a",
		quoteSecurityArg(item.account),
		"-s",
		quoteSecurityArg(item.service),
		"-w",
		quoteSecurityArg(JSON.stringify(content)),
	].join(" ");
	await ctx.exec(["-i"], `${command}\n`);
}

interface StoreWritePlan {
	file: boolean;
	keychain: { service: string; account: string } | null;
}

/**
 * Which stores this write has to reach. A dir holding a login in both a file
 * and a Keychain item gets both, or the CLI would keep serving the other
 * account from the one left behind.
 */
async function planStoreWrite(
	ref: ClaudeLoginStoreRef,
	read: ClaudeLoginRead,
	ctx: SwapContext,
): Promise<
	{ ok: true; plan: StoreWritePlan } | { ok: false; result: ClaudeSwapResult }
> {
	const file =
		read.fileLogin !== null || (!ctx.darwin && read.keychainLogin === null);
	if (read.keychainLogin !== null && read.keychainService) {
		const account =
			read.keychainAccount ??
			(await readKeychainAccountAttribute(read.keychainService, {
				exec: ctx.exec,
				darwin: ctx.darwin,
			}));
		if (!account) {
			return {
				ok: false,
				result: failure(
					"keychain-ambiguous",
					`the Keychain item under ${read.keychainService} matched only an unscoped lookup and its account attribute could not be resolved`,
				),
			};
		}
		return {
			ok: true,
			plan: { file, keychain: { service: read.keychainService, account } },
		};
	}
	if (ctx.darwin && read.fileLogin === null) {
		const service =
			ref.kind === "profile"
				? (keychainServicesForConfigDir(ref.dir)[0] as string)
				: CLAUDE_DEFAULT_KEYCHAIN_SERVICE;
		return {
			ok: true,
			plan: {
				file,
				keychain: {
					service,
					account: claudeKeychainAccounts()[0] ?? KEYCHAIN_ACCOUNT_FALLBACK,
				},
			},
		};
	}
	return { ok: true, plan: { file, keychain: null } };
}

/** Writes `oauth` into every store the plan names, preserving each store's
 * own siblings (`mcpOAuth` above all). */
async function applyStoreWrite(
	read: ClaudeLoginRead,
	plan: StoreWritePlan,
	oauth: Oauth,
	ctx: SwapContext,
): Promise<void> {
	if (plan.file) {
		if (read.fileContent) {
			await backupCredentialFile(read.credentialsPath, read.fileContent, ctx);
		}
		await writeCredentialFile(
			read.credentialsPath,
			{ ...(read.fileContent ?? {}), claudeAiOauth: oauth },
			ctx,
		);
	}
	if (plan.keychain) {
		await writeKeychainItem(
			plan.keychain,
			{ ...(read.keychainContent ?? {}), claudeAiOauth: oauth },
			ctx,
		);
	}
}

interface TargetLogin {
	ref: ClaudeLoginStoreRef;
	oauth: Oauth;
	identity: ClaudeSwapIdentity;
}

async function loadTarget(
	ref: ClaudeLoginStoreRef,
	ctx: SwapContext,
): Promise<
	{ ok: true; target: TargetLogin } | { ok: false; result: ClaudeSwapResult }
> {
	const invalid = await validateDir(storeDir(ref, ctx), ctx);
	if (invalid) return { ok: false, result: failure("invalid-target", invalid) };
	const read = await readStore(ref, ctx);
	const oauth = oauthOf(read);
	if (!oauth) {
		return {
			ok: false,
			result: failure(
				"no-target-login",
				`${storeDir(ref, ctx)} holds no Claude login`,
			),
		};
	}
	const identity = await readIdentity(
		claudeStatePath(configDirOf(ref), ctx.homeDir),
		ctx,
	);
	if (!identity) {
		return {
			ok: false,
			result: failure(
				"no-target-identity",
				`${storeDir(ref, ctx)} has no account identity to move with the login`,
			),
		};
	}
	return { ok: true, target: { ref, oauth, identity } };
}

/**
 * Steps 4 and 5: write the target's login and identity into the active dir
 * and read them back. Shared by the swap and by the first-use seed, which
 * has no owner to save back to.
 */
async function applyToActiveDir(
	target: TargetLogin,
	activeDir: string,
	ctx: SwapContext,
): Promise<ClaudeSwapResult> {
	const invalid = await validateDir(activeDir, ctx);
	if (invalid) return failure("invalid-active-dir", invalid);

	// The source is hashed again right before the write: a login the CLI
	// refreshed in between must not be written back stale.
	let oauth = target.oauth;
	let hash = hashOauth(oauth);
	for (let attempt = 0; ; attempt++) {
		const fresh = oauthOf(await readStore(target.ref, ctx));
		if (!fresh) {
			return failure(
				"no-target-login",
				`${storeDir(target.ref, ctx)} lost its login mid-swap`,
			);
		}
		const freshHash = hashOauth(fresh);
		if (freshHash === hash) break;
		if (attempt >= 1) {
			return failure(
				"source-changed",
				`${storeDir(target.ref, ctx)} kept changing while the swap read it`,
			);
		}
		oauth = fresh;
		hash = freshHash;
	}

	const activeRef: ClaudeLoginStoreRef = { kind: "profile", dir: activeDir };
	const activeRead = await readStore(activeRef, ctx);
	const planned = await planStoreWrite(activeRef, activeRead, ctx);
	if (!planned.ok) return planned.result;
	try {
		await applyStoreWrite(activeRead, planned.plan, oauth, ctx);
	} catch (error) {
		return failure(
			"write-failed",
			`writing the login into ${activeDir} failed: ${errorText(error)}`,
		);
	}
	try {
		await updateClaudeStateFile(join(activeDir, ".claude.json"), (state) => {
			for (const key of CLAUDE_IDENTITY_KEYS) delete state[key];
			return { ...state, ...target.identity.keys };
		});
	} catch (error) {
		return failure(
			"write-failed",
			`writing the identity into ${activeDir} failed: ${errorText(error)}`,
		);
	}

	const verifyRead = await readStore(activeRef, ctx);
	if (hashOauth(oauthOf(verifyRead)) !== hash) {
		return failure(
			"verify-failed",
			`${activeDir} did not read back as the target login`,
		);
	}
	const verifyIdentity = await readIdentity(
		join(activeDir, ".claude.json"),
		ctx,
	);
	if (
		JSON.stringify(verifyIdentity?.keys ?? null) !==
		JSON.stringify(target.identity.keys)
	) {
		return failure(
			"verify-failed",
			`${activeDir} did not read back as the target identity`,
		);
	}
	return { ok: true, identity: target.identity };
}

/**
 * Puts `target`'s login in the active dir and saves the login it replaces
 * back to `ownerBinding`'s own store. `ownerBinding` names the account whose
 * login is in the active dir now; without it the swap refuses rather than
 * guess, because saving A's refreshed token into B's dir signs B out.
 */
export async function swapClaudeLogin(input: {
	target: ClaudeLoginStoreRef;
	ownerBinding: ClaudeLoginStoreRef | undefined;
	activeDir: string;
	deps?: ClaudeSwapDeps;
}): Promise<ClaudeSwapResult> {
	const ctx = buildContext(input.deps);
	const { ownerBinding } = input;
	if (!ownerBinding) {
		return failure(
			"owner-unknown",
			"no account is bound to the login currently in the active dir",
		);
	}

	const loaded = await loadTarget(input.target, ctx);
	if (!loaded.ok) return loaded.result;

	const activeRef: ClaudeLoginStoreRef = {
		kind: "profile",
		dir: input.activeDir,
	};
	const activeInvalid = await validateDir(input.activeDir, ctx);
	if (activeInvalid) return failure("invalid-active-dir", activeInvalid);
	const previous = oauthOf(await readStore(activeRef, ctx));

	const ownerInvalid = await validateDir(storeDir(ownerBinding, ctx), ctx);
	if (ownerInvalid) return failure("invalid-owner", ownerInvalid);
	if (previous) {
		const ownerRead = await readStore(ownerBinding, ctx);
		if (!wouldRegress(oauthOf(ownerRead), previous)) {
			const planned = await planStoreWrite(ownerBinding, ownerRead, ctx);
			if (!planned.ok) return planned.result;
			try {
				await applyStoreWrite(ownerRead, planned.plan, previous, ctx);
			} catch (error) {
				return failure(
					"write-failed",
					`saving the previous login back to ${storeDir(ownerBinding, ctx)} failed: ${errorText(error)}`,
				);
			}
		}
	}

	return applyToActiveDir(loaded.target, input.activeDir, ctx);
}

/**
 * First use of the active dir: copies `source`'s login and identity in
 * without saving anything back, since nothing of the user's is there yet.
 */
export async function seedActiveClaudeLogin(input: {
	source: ClaudeLoginStoreRef;
	activeDir: string;
	deps?: ClaudeSwapDeps;
}): Promise<ClaudeSwapResult> {
	const ctx = buildContext(input.deps);
	const loaded = await loadTarget(input.source, ctx);
	if (!loaded.ok) return loaded.result;
	return applyToActiveDir(loaded.target, input.activeDir, ctx);
}
