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
 *  4. re-validate the active dir, re-read the source (one retry if its login
 *     moved, refusing outright if its account did), write the target's
 *     `claudeAiOauth` preserving `mcpOAuth`, then swap the identity block in
 *     `.claude.json` preserving onboarding and trust;
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
import { basename, dirname, join, resolve, sep } from "node:path";
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
	/** The target was signed in again between the read of its identity and
	 * the write, so its login and its identity no longer belong together. */
	| "target-changed"
	| "keychain-ambiguous"
	| "write-failed"
	/** The write landed in part — a credential without its identity, or one
	 * of two credential stores — and putting the previous login back failed
	 * too: the active dir stays mixed until something reconciles it. */
	| "split-state"
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

/**
 * How a refusal names the Keychain store: the spelling whose item it could not
 * read, which is the item the user has to unlock or delete. NOT
 * `keychainService` — that is whichever spelling held the freshest item that
 * DID parse, so naming it pointed the user at the one thing that was fine, and
 * when nothing parsed it fell through to naming a directory, which holds no
 * Keychain item at all. Both fallbacks stay for a caller that names the store
 * with nothing unread.
 */
function keychainStoreName(
	read: ClaudeLoginRead,
	ref: ClaudeLoginStoreRef,
	ctx: SwapContext,
): string {
	if (read.keychainUnreadableServices.length > 0) {
		return read.keychainUnreadableServices.join(", ");
	}
	return read.keychainService ?? storeDir(ref, ctx);
}

/**
 * The file half of `keychainStoreName`: the candidate path the read could not
 * open, which is the file the user has to unlock or repair. NOT
 * `credentialsPath` — that is the candidate that WON, so it is the readable
 * one whenever the file half supplied the login, and when nothing was readable
 * it falls back to the first candidate, which may simply be absent. The dir is
 * the fallback rather than a path this could not know.
 */
function fileStoreName(
	read: ClaudeLoginRead,
	ref: ClaudeLoginStoreRef,
	ctx: SwapContext,
): string {
	if (read.unreadableFileCandidates.length > 0) {
		return read.unreadableFileCandidates.join(", ");
	}
	return storeDir(ref, ctx);
}

function configDirOf(ref: ClaudeLoginStoreRef): string | null {
	return ref.kind === "profile" ? ref.dir : null;
}

async function isInside(
	real: string,
	base: string,
	ctx: SwapContext,
): Promise<boolean> {
	// Both sides canonical: the candidate was resolved above, so a base spelled
	// through a symlink (`/home` -> `/var/home`, `~/.superset` on another
	// volume) has to be resolved too or nothing is ever inside it. `resolve` is
	// the fallback for a root that does not exist yet, and drops a trailing
	// separator either way.
	const root = await ctx.fs.realpath(base).catch(() => resolve(base));
	return real === root || real.startsWith(`${root}${sep}`);
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
	if (
		!(await isInside(real, ctx.homeDir, ctx)) &&
		!(await isInside(real, ctx.supersetHomeDir, ctx))
	) {
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

/** JSON with every object's keys sorted, at every depth. `JSON.stringify`'s
 * replacer-array form sorts only the top level and drops nested properties
 * altogether, which hashed a nested change as no change at all. */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : 1));
		return `{${entries
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/** Stable over key order at every depth, so a rewrite that only reorders keys
 * is not read as a concurrent login change. */
function hashOauth(oauth: Oauth | undefined): string {
	if (!oauth) return "";
	return createHash("sha256").update(stableStringify(oauth)).digest("hex");
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

/** True when `reread` is `written` after the running CLI refreshed it: the same
 * login moved forward to a later expiry. Whose login it is is not this
 * function's question — the identity file beside it answers that. */
function isRefreshedLogin(written: Oauth, reread: Oauth | undefined): boolean {
	if (!reread) return false;
	return timestamp(reread, "expiresAt") > timestamp(written, "expiresAt");
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

/**
 * Exactly the keys an identity write replaces, as the state file holds them
 * right now — the snapshot a rollback puts back. Unlike `readIdentity` this
 * does not care whether they name an account: an empty result means the dir
 * had no identity, and restoring it removes the target's. `null` is the third
 * answer, and the reason the two are told apart: a file that is there but
 * could not be read is not an empty one, and taking a torn or denied read for
 * "no identity" would have the rollback delete the dir's own account instead
 * of putting it back. The line falls exactly where `updateClaudeStateFile`
 * puts it, since that is what performs the restore: the states it starts from
 * `{}` are the ones an empty snapshot restores faithfully, and the read it
 * throws on is the one nothing can be restored from.
 */
async function readIdentityKeys(
	statePath: string,
	ctx: SwapContext,
): Promise<Record<string, unknown> | null> {
	const keys: Record<string, unknown> = {};
	let raw: string;
	try {
		raw = await ctx.fs.readFile(statePath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
		return keys;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return keys;
		}
		const state = parsed as Record<string, unknown>;
		for (const key of CLAUDE_IDENTITY_KEYS) {
			if (key in state) keys[key] = state[key];
		}
	} catch {
		// Bytes that do not parse are the bytes the restore copies aside and
		// starts from empty state, so the dir really has no identity keys to put
		// back — unlike a failed read, which puts nothing back at all.
	}
	return keys;
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

/** Removes an item a rollback has to un-create. No secret is involved, so this
 * one goes through argv like the reads do. */
async function deleteKeychainItem(
	item: { service: string; account: string },
	ctx: SwapContext,
): Promise<void> {
	await ctx.exec([
		"delete-generic-password",
		"-a",
		item.account,
		"-s",
		item.service,
	]);
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
	// The item the read located, login in it or not: `applyStoreWrite` merges
	// its bytes, so addressing anything else writes one item's siblings into
	// another. The computed spelling below is for a dir with no item at all.
	if (read.keychainContent !== null && read.keychainService) {
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
	/** Filled in as each store lands, so a caller can roll back exactly the
	 * stores a write that failed halfway had already reached. */
	written: StoreWritePlan = { file: false, keychain: null },
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
		written.file = true;
	}
	if (plan.keychain) {
		await writeKeychainItem(
			plan.keychain,
			{ ...(read.keychainContent ?? {}), claudeAiOauth: oauth },
			ctx,
		);
		written.keychain = plan.keychain;
	}
}

/**
 * Puts every store a failed write had already reached back to its own pre-swap
 * snapshot, so a half-applied swap does not leave the dir serving two accounts.
 * Each store is restored from its own bytes — writing one "freshest" login into
 * both would sign one of them in as the other — and a store that held no
 * credential before the swap has the one the swap created removed, rather than
 * left holding the target's login. `previousIdentity` does the same for the
 * `.claude.json` identity block once that has been written — the keys the dir
 * held before, empty when it had none, and `null` when the identity write had
 * not run yet and the file is still the dir's own. Both halves go back
 * together: a credential restored under the target's name is the split the
 * rollback exists to prevent. Reports `code` — what went wrong before the
 * rollback — once the dir is whole again, `split-state` when the restore failed
 * too.
 */
async function rollbackActiveWrite(
	activeRead: ClaudeLoginRead,
	written: StoreWritePlan,
	activeDir: string,
	reason: string,
	code: "write-failed" | "verify-failed",
	ctx: SwapContext,
	previousIdentity: Record<string, unknown> | null = null,
): Promise<ClaudeSwapResult> {
	if (!written.file && !written.keychain && !previousIdentity) {
		return failure(code, reason);
	}
	try {
		if (written.file) {
			if (activeRead.fileContent) {
				await writeCredentialFile(
					activeRead.credentialsPath,
					activeRead.fileContent,
					ctx,
				);
			} else if (!activeRead.fileUnreadable) {
				await ctx.fs.unlink(activeRead.credentialsPath);
			}
		}
		if (written.keychain) {
			if (activeRead.keychainContent) {
				await writeKeychainItem(
					written.keychain,
					activeRead.keychainContent,
					ctx,
				);
			} else {
				await deleteKeychainItem(written.keychain, ctx);
			}
		}
		if (previousIdentity) {
			await updateClaudeStateFile(join(activeDir, ".claude.json"), (state) => {
				for (const key of CLAUDE_IDENTITY_KEYS) delete state[key];
				return { ...state, ...previousIdentity };
			});
		}
	} catch (rollbackError) {
		return failure(
			"split-state",
			`${reason}; ${activeDir} still holds the target login and could not be rolled back: ${errorText(rollbackError)}`,
		);
	}
	return failure(code, reason);
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
	const read = await readStore(ref, ctx);
	const oauth = oauthOf(read);
	// A store nobody could read is not a signed-out one. The `!oauth` return
	// below runs before the unread-half guard further down, so a profile whose
	// only store was locked came back as `no-target-login` — byte-identical to
	// a dir the user really is signed out of, sending them to run `/login`
	// instead of unlocking the item that already holds their account. Its own
	// branch rather than a reorder: with nothing read, `read.source` falls back
	// to "file" (no Keychain login means the Keychain cannot win), so the guard
	// below would tell a Keychain-only profile with no credential file that its
	// FILE login "may be the older of the two". Nothing was read, so there is no
	// login to be older than, and the tail is dropped with the claim.
	if (!oauth && (read.keychainUnreadable || read.anyFileCandidateUnreadable)) {
		const unread = read.keychainUnreadable
			? `${keychainStoreName(read, ref, ctx)}'s Keychain item`
			: fileStoreName(read, ref, ctx);
		return {
			ok: false,
			result: failure(
				"invalid-target",
				`${unread} exists but could not be read, and no login was read from ${storeDir(ref, ctx)} at all; refusing to treat it as signed out`,
			),
		};
	}
	if (!oauth) {
		return {
			ok: false,
			result: failure(
				"no-target-login",
				`${storeDir(ref, ctx)} holds no Claude login`,
			),
		};
	}
	// The read returns the fresher of the target's two stores, but only of the
	// halves it could read: any half it could not may hold a newer login, and
	// taking the one this read did see for the target's current login swaps a
	// STALE credential into the active dir and reports it as success. Every
	// unread half counts, not just the one on the other side of the winner: a
	// store that supplied the login can still have a second candidate — the
	// other half of the system default's one slot, a second Keychain spelling —
	// that went unread and held the newer copy. `anyFileCandidateUnreadable`,
	// not `fileUnreadable`, is the read question: `fileUnreadable` asks whether
	// a WRITE may land on `credentialsPath` and is false by construction
	// whenever the file half won. An absent file and an absent Keychain item
	// set neither flag, so a Keychain-only profile and a default living in one
	// half of its slot still swap.
	if (read.keychainUnreadable || read.anyFileCandidateUnreadable) {
		// Two different questions, so two different selections. What could not
		// be read is what the user has to go look at; what would have been
		// swapped in is `read.source`, and once a store can supply the login
		// AND have an unread half the two come apart. Deriving both from the
		// same flag said "refusing to swap in <dir>'s Keychain login" of a
		// login that came out of a file, and the reverse.
		const unread = read.keychainUnreadable
			? `${keychainStoreName(read, ref, ctx)}'s Keychain item`
			: fileStoreName(read, ref, ctx);
		const supplied = read.source === "file" ? "file" : "Keychain";
		return {
			ok: false,
			result: failure(
				"invalid-target",
				`${unread} exists but could not be read; refusing to swap in ${storeDir(ref, ctx)}'s ${supplied} login, which may be the older of the two`,
			),
		};
	}
	// The login can come from either half of the system default's one slot, and
	// `~/.config/claude` is a dir `storeDir` never names — validate the one it
	// actually came from. A Keychain-only login has no dir to validate.
	if (read.source === "file") {
		const invalid = await validateDir(dirname(read.credentialsPath), ctx);
		if (invalid)
			return { ok: false, result: failure("invalid-target", invalid) };
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
		const read = await readStore(target.ref, ctx);
		// `loadTarget` judged the halves of ITS read; this is a second read of
		// the same store, and it gets the same question because the loop ADOPTS
		// what this one returns. A probe that starts failing only after
		// `loadTarget` leaves the fresher half unseen while the staler one still
		// answers: the hash mismatch reads as an ordinary refresh, the stale
		// login is adopted, the next attempt confirms it, and the swap writes it
		// back as `ok`. `sameAccount` cannot catch that — a degraded read of the
		// same account is still the same account. Placed before the `!fresh`
		// branch, so a store whose BOTH halves went unread is named as one
		// nothing could be read from rather than as one that "lost its login".
		if (read.keychainUnreadable || read.anyFileCandidateUnreadable) {
			const unread = read.keychainUnreadable
				? `${keychainStoreName(read, target.ref, ctx)}'s Keychain item`
				: fileStoreName(read, target.ref, ctx);
			return failure(
				"invalid-target",
				`${unread} exists but could not be read while the swap re-read ${storeDir(target.ref, ctx)}; refusing to swap in a login that may be the older of the two`,
			);
		}
		const fresh = oauthOf(read);
		if (!fresh) {
			return failure(
				"no-target-login",
				`${storeDir(target.ref, ctx)} lost its login mid-swap`,
			);
		}
		// The identity is re-read with it: a `/login` in the target since
		// loadTarget pairs a new credential with the identity read before it,
		// and writing that pair signs the active dir in as one account under
		// another account's name.
		const freshIdentity = await readIdentity(
			claudeStatePath(configDirOf(target.ref), ctx.homeDir),
			ctx,
		);
		if (!freshIdentity) {
			return failure(
				"target-changed",
				`${storeDir(target.ref, ctx)}'s account identity could not be read while the swap read its login`,
			);
		}
		const sameAccount =
			target.identity.accountUuid && freshIdentity.accountUuid
				? freshIdentity.accountUuid === target.identity.accountUuid
				: freshIdentity.emailAddress === target.identity.emailAddress;
		if (!sameAccount) {
			return failure(
				"target-changed",
				`${storeDir(target.ref, ctx)} was signed in as account ${freshIdentity.accountUuid ?? freshIdentity.emailAddress ?? "none it names"} while the swap read it`,
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
	// The write below goes through a rename, which needs only directory
	// permission — so a credential file that is there but unreadable would be
	// replaced by a store this swap never saw, and the rollback would have
	// nothing to put back.
	if (activeRead.fileUnreadable) {
		return failure(
			"invalid-active-dir",
			`${activeRead.credentialsPath} exists but could not be read; refusing to write over it`,
		);
	}
	// The Keychain half of the same guard, and the worse half: an unread item
	// reads exactly like an absent one, `add-generic-password -U` then replaces
	// its data in place with no backup and none of its siblings, and the
	// rollback, seeing the same null, deletes it outright.
	if (activeRead.keychainUnreadable) {
		return failure(
			"invalid-active-dir",
			`${keychainStoreName(activeRead, activeRef, ctx)}'s Keychain item exists but could not be read; refusing to write over it`,
		);
	}
	// Snapshot the dir's own identity BEFORE any write lands: once the target's
	// credential is on disk a running session can rewrite `.claude.json` with
	// the target's identity, and a snapshot taken then is the target's, not the
	// dir's own.
	const previousIdentity = await readIdentityKeys(
		join(activeDir, ".claude.json"),
		ctx,
	);
	// No snapshot, no identity write: the rollback restores what this read
	// returned, so writing on a read that failed would have it delete the dir's
	// own account rather than put it back — a credential with no identity, which
	// every later swap refuses as an owner it cannot name. Refuse pre-flight, so
	// the target's credential never lands in a dir this swap cannot restore.
	if (previousIdentity === null) {
		return failure(
			"write-failed",
			`${join(activeDir, ".claude.json")} exists but could not be read; refusing to write an identity a rollback could not put back`,
		);
	}
	const planned = await planStoreWrite(activeRef, activeRead, ctx);
	if (!planned.ok) return planned.result;
	// The dir was judged at the top of this function, and the target re-read,
	// the active re-read and — on darwin — a Keychain prompt have run since.
	// Validate the dir the credential and its backups actually land in, in the
	// moment before they do, as the save-back does.
	//
	// Unconditional, and NOT gated on `planned.plan.file`, because that flag
	// only correlates with a write into this dir — the gate has to be the
	// write's own condition. Two writes land here and this is the dir for both:
	// `activeRef` is always a profile, so the credential goes to `activeDir`
	// itself, and unlike the owner's — whose `.claude.json` can live a
	// directory away, which is why the save-back's twin of this check is split
	// in two — the identity write goes to `activeDir/.claude.json`, and it runs
	// on every path through here. Gating on `plan.file` left the ordinary macOS
	// shape, a Keychain-backed active dir, with NEITHER write judged: the login
	// went into the item and the target's identity into a dir that had become
	// group-writable in the window above. Nothing safe is refused by asking
	// always — `planStoreWrite` cannot answer `{file:false, keychain:null}` and
	// the identity write always runs, so every path through this point writes
	// something. Asked before `applyStoreWrite`, so a refusal still writes
	// nothing.
	//
	// The honest limit: this narrows the window from two store reads and a
	// Keychain prompt to a few syscalls, and does NOT close the TOCTOU — only
	// opening the dir once and writing through that fd (`openat`) would, and
	// nothing here does. Nor is it a privilege boundary: only a process running
	// as this user can substitute the dir, and that process can already read the
	// credential. It restores the invariant `validateDir` states — re-run
	// immediately before every write — and nobody should read it as a guarantee.
	const pathInvalid = await validateDir(activeDir, ctx);
	if (pathInvalid) return failure("invalid-active-dir", pathInvalid);
	// A plan naming two stores can fail on the second with the first already
	// holding the target: the CLI would then serve whichever it prefers.
	const written: StoreWritePlan = { file: false, keychain: null };
	try {
		await applyStoreWrite(activeRead, planned.plan, oauth, ctx, written);
	} catch (error) {
		return rollbackActiveWrite(
			activeRead,
			written,
			activeDir,
			`writing the login into ${activeDir} failed: ${errorText(error)}`,
			"write-failed",
			ctx,
		);
	}
	try {
		await updateClaudeStateFile(join(activeDir, ".claude.json"), (state) => {
			for (const key of CLAUDE_IDENTITY_KEYS) delete state[key];
			return { ...state, ...target.identity.keys };
		});
	} catch (error) {
		// The credential is already the target's while the identity still names
		// the previous account — the exact state a later save-back reads as the
		// previous account's own login. Undo the credential so the dir stays
		// whole; the protocol is not transactional, this one step is. The
		// identity needs no undo here: that write is tmp-then-rename, so a
		// throw leaves the dir's own block in place.
		return rollbackActiveWrite(
			activeRead,
			written,
			activeDir,
			`writing the identity into ${activeDir} failed: ${errorText(error)}`,
			"write-failed",
			ctx,
		);
	}

	// What one read-back pair says about the swap, each half on its own so the
	// refusal below can still name which one disagreed. Both are judged from
	// the same pair because the refresh tolerance leans on the identity to say
	// whose refresh it was.
	const readsAsTarget = (
		read: ClaudeLoginRead,
		identityRead: ClaudeSwapIdentity | null,
	): { login: boolean; identity: boolean } => ({
		identity:
			JSON.stringify(identityRead?.keys ?? null) ===
			JSON.stringify(target.identity.keys),
		login:
			hashOauth(oauthOf(read)) === hash ||
			// A session running against the active dir can refresh the login the
			// swap just wrote before the read-back sees it. That is still the
			// target's own login, one refresh newer, and the identity beside it is
			// what says so — the swap landed, so undoing it here would sign the
			// caller out of the account it just asked for.
			(target.identity.accountUuid !== null &&
				identityRead?.accountUuid === target.identity.accountUuid &&
				isRefreshedLogin(oauth, oauthOf(read))),
	});
	let verifyRead = await readStore(activeRef, ctx);
	let verifyIdentity = await readIdentity(join(activeDir, ".claude.json"), ctx);
	let verdict = readsAsTarget(verifyRead, verifyIdentity);
	// Decided on the first pair, not on the flags it carries: a read that
	// answered the target's login AND the target's identity has confirmed the
	// swap, whatever else it could not see. On darwin any spelling that times
	// out flags the whole read while the login is still served by another
	// spelling or by the file half, and re-reading a pair that already
	// confirmed can only replace it with a worse one — the second look is where
	// a half that answered stops answering, and the rollback that follows undoes
	// a swap this step had verified. It also saves a store read and a Keychain
	// prompt on the path every swap takes.
	if (verdict.login && verdict.identity) {
		return { ok: true, identity: target.identity };
	}
	// A read-back that could not read is not a read-back that disagreed, and
	// both halves are read again once before either decides anything — the same
	// retry the source re-read above uses for a moving target. A torn read, an
	// item caught mid-rewrite, or one probe that timed out answers on the second
	// look, which is the whole window for most of them. The identity is retried
	// with the credential because it is what the refresh tolerance leans on: a
	// `.claude.json` that briefly would not open leaves the tolerance unable to
	// name the account, and a login the target's own session merely refreshed
	// gets rolled back for it. Deciding first takes none of that away: a store
	// nothing read yields no matching login, and an identity nothing read no
	// matching identity, so every pair this retry exists for falls through to it.
	if (
		verifyRead.keychainUnreadable ||
		verifyRead.anyFileCandidateUnreadable ||
		verifyIdentity === null
	) {
		verifyRead = await readStore(activeRef, ctx);
		verifyIdentity = await readIdentity(join(activeDir, ".claude.json"), ctx);
		verdict = readsAsTarget(verifyRead, verifyIdentity);
	}
	if (!verdict.login || !verdict.identity) {
		// A store still unreadable after the retry rolls back too, and that is a
		// deliberate trade rather than an oversight: nothing was read, so this
		// cannot tell "the target, one refresh newer" from "a third account's
		// `/login` landed in this window" — and reporting `ok` on the second
		// hands the caller a session signed in as a stranger, which is the one
		// thing the verify step exists to catch. The rollback puts back bytes
		// this swap read itself before the write, so it destroys no store it
		// never saw; what it costs is a rotation this swap could not see, and
		// the target may need a fresh `/login`. Not `split-state`: the write
		// landed whole and the rollback is running normally.
		const storeUnreadable =
			verifyRead.keychainUnreadable || verifyRead.anyFileCandidateUnreadable;
		// Naming the item beats "did not read back as the target login" when
		// nothing read back at all: the user unlocks or repairs it instead of
		// hunting for a third account that never landed.
		const unread = verifyRead.keychainUnreadable
			? `${keychainStoreName(verifyRead, activeRef, ctx)}'s Keychain item`
			: fileStoreName(verifyRead, activeRef, ctx);
		// Unlike the write failures above, the dir now holds the target while
		// the caller still believes the previous account is live; put its own
		// snapshot back — identity included, since by here `.claude.json`
		// names the target — rather than leave the two disagreeing.
		return rollbackActiveWrite(
			activeRead,
			written,
			activeDir,
			storeUnreadable
				? `${unread} exists but could not be read while the swap verified ${activeDir}; rolling the write back rather than reporting a login nothing could see`
				: `${activeDir} did not read back as the target ${verdict.login ? "identity" : "login"}`,
			"verify-failed",
			ctx,
			previousIdentity,
		);
	}
	return { ok: true, identity: target.identity };
}

/**
 * Why the login sitting in the active dir cannot be the one `ownerBinding`
 * names: it carries no readable account identity, or one that is somebody
 * else's. Null when the save-back is safe, including when the caller offered
 * no expectation, which keeps today's behaviour.
 */
async function activeIdentityMismatch(
	activeDir: string,
	ownerBinding: ClaudeLoginStoreRef,
	expectedOwnerAccountId: string | null | undefined,
	ctx: SwapContext,
): Promise<string | null> {
	if (!expectedOwnerAccountId) return null;
	const activeIdentity = await readIdentity(
		claudeStatePath(activeDir, ctx.homeDir),
		ctx,
	);
	if (!activeIdentity?.accountUuid) {
		return `the login in ${activeDir} has no readable account identity, so it cannot be confirmed as the one bound to ${storeDir(ownerBinding, ctx)}`;
	}
	if (activeIdentity.accountUuid !== expectedOwnerAccountId) {
		return `the login in ${activeDir} belongs to account ${activeIdentity.accountUuid}, not the one bound to ${storeDir(ownerBinding, ctx)}`;
	}
	return null;
}

/**
 * Why `ownerBinding`'s store cannot take the save-back: it names a different
 * account than the caller expects, or it holds a login whose account cannot be
 * read at all. Null when the write is safe — including when the caller offered
 * no expectation, which keeps today's behaviour, and when the store is empty,
 * since the save-back is what fills it.
 */
async function ownerStoreMismatch(
	ownerBinding: ClaudeLoginStoreRef,
	ownerRead: ClaudeLoginRead,
	expectedOwnerAccountId: string | null | undefined,
	ctx: SwapContext,
): Promise<string | null> {
	if (!expectedOwnerAccountId) return null;
	const identity = await readIdentity(
		claudeStatePath(configDirOf(ownerBinding), ctx.homeDir),
		ctx,
	);
	const accountUuid = identity?.accountUuid ?? null;
	if (accountUuid === expectedOwnerAccountId) return null;
	if (accountUuid === null && !oauthOf(ownerRead)) return null;
	return `${storeDir(ownerBinding, ctx)} is signed in as account ${accountUuid ?? "none it names"}, not the expected ${expectedOwnerAccountId}`;
}

/**
 * Puts `target`'s login in the active dir and saves the login it replaces
 * back to `ownerBinding`'s own store. `ownerBinding` names the account whose
 * login is in the active dir now; without it the swap refuses rather than
 * guess, because saving A's refreshed token into B's dir signs B out.
 *
 * `expectedOwnerAccountId` is that same claim as an identity: pass the owner's
 * accountUuid and the save-back is checked against the identity actually in
 * the active dir, and again against the one in `ownerBinding`'s own store,
 * before it writes — either side may have been re-authenticated as somebody
 * else since discovery. Optional so a caller that has no identity to offer
 * keeps today's behaviour.
 *
 * `expectedTargetAccountId` is the other half: the account the caller believes
 * `target` holds. Checked against the identity actually in the target's dir
 * before anything is written, so a profile re-authenticated as someone else
 * since the last poll is refused rather than swapped in. Optional on the same
 * terms.
 *
 * `ownerManaged: false` drops the save-back altogether: a config dir the user
 * exported by hand is Superset's to read, never to write, so the login it
 * owns is left where the CLI last put it rather than saved back here.
 */
export async function swapClaudeLogin(input: {
	target: ClaudeLoginStoreRef;
	ownerBinding: ClaudeLoginStoreRef | undefined;
	/** The accountUuid `ownerBinding` stands for, when the caller knows it. */
	expectedOwnerAccountId?: string | null;
	/** The accountUuid `target` is expected to hold, when the caller knows it. */
	expectedTargetAccountId?: string | null;
	/** Whether Superset may write `ownerBinding`'s store. Default true. */
	ownerManaged?: boolean;
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

	// The caller's target claim is only as fresh as its last poll: a `/login`
	// in that profile since then re-authenticated it as somebody else, and
	// swapping it in would sign the session in as an account nobody asked for.
	// An identity that names no account fails closed for the same reason.
	if (
		input.expectedTargetAccountId &&
		loaded.target.identity.accountUuid !== input.expectedTargetAccountId
	) {
		return failure(
			"target-changed",
			`${storeDir(input.target, ctx)} is signed in as account ${loaded.target.identity.accountUuid ?? "none it names"}, not the expected ${input.expectedTargetAccountId}`,
		);
	}

	const activeRef: ClaudeLoginStoreRef = {
		kind: "profile",
		dir: input.activeDir,
	};
	const activeInvalid = await validateDir(input.activeDir, ctx);
	if (activeInvalid) return failure("invalid-active-dir", activeInvalid);
	// `applyToActiveDir` asks these same two questions of its OWN re-read, and
	// has to: it is shared with the seed, which never comes through here. But it
	// asks them only after the save-back below has already written the owner's
	// store, so a swap that ends in `invalid-active-dir` had mutated a dir it
	// then declined to swap — the owner's credential replaced, its `.claude.json`
	// given the active dir's identity, and one of its three backup slots spent.
	// Asked here, of the read this already takes, a refused swap writes nothing.
	// The harm was bounded, since `wouldRegress` only ever moves the owner store
	// forward, but a swap nobody performs must leave no trace.
	const activePreviousRead = await readStore(activeRef, ctx);
	if (activePreviousRead.fileUnreadable) {
		return failure(
			"invalid-active-dir",
			`${activePreviousRead.credentialsPath} exists but could not be read; refusing to write over it`,
		);
	}
	if (activePreviousRead.keychainUnreadable) {
		return failure(
			"invalid-active-dir",
			`${keychainStoreName(activePreviousRead, activeRef, ctx)}'s Keychain item exists but could not be read; refusing to write over it`,
		);
	}
	const previous = oauthOf(activePreviousRead);
	// The identity that belongs with that login, read in the same pre-flight
	// and for the same reason. `readIdentityKeys` answers `null` for a
	// `.claude.json` that is there but could not be read, and the save-back
	// below took that for "no identity to copy" — skipping the identity write
	// AFTER its credential write had landed, which left the owner holding a
	// credential no state file names. Nothing falls open by refusing here: the
	// snapshot `applyToActiveDir` takes of this same file refuses the same read
	// a few steps later, on every run, so the swap already ended in
	// `write-failed`; all this changes is that it now ends there before
	// anything is written. Read once and reused below, because the pre-write
	// snapshot is pinned as the SECOND read of this path.
	const activeIdentity = await readIdentityKeys(
		join(input.activeDir, ".claude.json"),
		ctx,
	);
	if (activeIdentity === null) {
		return failure(
			"write-failed",
			`${join(input.activeDir, ".claude.json")} exists but could not be read; refusing to save back a login nothing could name`,
		);
	}

	// An unmanaged owner is never validated and never written: the dir is not
	// Superset's, so neither its permissions nor its backups are its business.
	// Nor is an owner with no login to save back: the gate belongs to the
	// write, so a dir nothing lands in is never judged on where it could land.
	if (input.ownerManaged !== false && previous) {
		// The caller's owner claim is refreshed at most once a tick, so a `/login`
		// run inside a live session leaves a login here that `ownerBinding` does
		// not name. `wouldRegress` cannot catch that — expiry timestamps are
		// unrelated across accounts — so compare the identities instead. An
		// identity that is missing or unreadable fails closed: an unnamed login
		// saved into the owner's store signs the owner out just the same. A dir
		// holding no credential at all has nothing to save back, so it proceeds. An
		// unmanaged owner is skipped for the same reason the write below is: the gate
		// protects the save-back, and there is none.
		const activeCheck = await activeIdentityMismatch(
			input.activeDir,
			ownerBinding,
			input.expectedOwnerAccountId,
			ctx,
		);
		if (activeCheck) return failure("owner-unknown", activeCheck);
		// Read here, not lower, because `ownerStoreMismatch` below consumes it.
		// What it says about writing is asked inside the write block.
		const ownerRead = await readStore(ownerBinding, ctx);
		// The other half of the same staleness: the caller's binding says whose
		// store this is, but a `/login` in that profile since discovery
		// re-authenticated it as somebody else, and saving the active login over
		// it destroys that login and mislabels the survivor. Re-read the identity
		// beside the store in the moment before the write. A store that holds a
		// login but names no account is unreadable, not empty, and fails closed
		// the same way. Judged before `wouldRegress`, not inside it: a `/login` in
		// the owner profile is exactly what makes its store look newer, so nesting
		// this skipped the check in the case it exists to catch.
		const ownerCheck = await ownerStoreMismatch(
			ownerBinding,
			ownerRead,
			input.expectedOwnerAccountId,
			ctx,
		);
		if (ownerCheck) return failure("owner-unknown", ownerCheck);
		// The login this saves back, as it stands in the moment before the write: a
		// session refreshed it while the owner store was read, and saving the value
		// from before that write loses the rotated refresh token.
		//
		// Both halves, because `?? previous` only ever defended a read that
		// returned NOTHING: `login` is set from whichever half answered, so a
		// read that lost one comes back truthy with the survivor and the
		// fallback never fires. The survivor can be the staler of the two, and
		// saving it back writes the owner's store to a login this same swap
		// read past — while the active dir moves on to the target, leaving the
		// newer one in no store at all. `wouldRegress` cannot see it: it weighs
		// the owner's own copy against this payload, never against `previous`.
		// The read question again, so `anyFileCandidateUnreadable` rather than
		// `fileUnreadable` — nothing is written to this dir here.
		const activeNow = await readStore(activeRef, ctx);
		if (activeNow.keychainUnreadable || activeNow.anyFileCandidateUnreadable) {
			const unread = activeNow.keychainUnreadable
				? `${keychainStoreName(activeNow, activeRef, ctx)}'s Keychain item`
				: fileStoreName(activeNow, activeRef, ctx);
			return failure(
				"invalid-active-dir",
				`${unread} exists but could not be read while the swap re-read ${input.activeDir}; refusing to save back a login that may be the older of the two`,
			);
		}
		const current = oauthOf(activeNow) ?? previous;
		// A login that moved may be a different account's, not just a newer token.
		if (hashOauth(current) !== hashOauth(previous)) {
			const movedCheck = await activeIdentityMismatch(
				input.activeDir,
				ownerBinding,
				input.expectedOwnerAccountId,
				ctx,
			);
			if (movedCheck) return failure("owner-unknown", movedCheck);
		}
		// The destination read in the same moment as the payload: a session
		// running against the owner's own store refreshes its token there too,
		// and it is the same account, so `ownerStoreMismatch` never sees it.
		// Judging the regress check — and the backup, and the sibling merge —
		// on the snapshot from before that refresh overwrites the newer login
		// and keeps a backup of bytes it did not overwrite.
		const ownerNow = await readStore(ownerBinding, ctx);
		// And the identity question again, of that same re-read, for the reason
		// the active dir asks it twice: a store that moved may be a different
		// account's, not just a newer token. `ownerStoreMismatch` above judged
		// the read from before this window, so a `/login` in the owner profile
		// inside it left the write aimed at somebody else's store — and
		// `wouldRegress` cannot stand in, since it weighs two expiry timestamps
		// and never sees an account. An owner that was empty and is still empty
		// answers null here exactly as it did there, so the save-back that fills
		// an empty store is untouched.
		const ownerNowCheck = await ownerStoreMismatch(
			ownerBinding,
			ownerNow,
			input.expectedOwnerAccountId,
			ctx,
		);
		if (ownerNowCheck) return failure("owner-unknown", ownerNowCheck);
		if (!wouldRegress(oauthOf(ownerNow), current)) {
			// Every judgement on the owner's store belongs to the write, so all
			// of them are made here rather than above `wouldRegress`: a save-back
			// the regress check skips writes NOTHING to that dir — no credential,
			// no backup, no identity — and refusing the whole rotation over a
			// store nothing was going to touch is a refusal the user cannot act
			// on, since the dir is fine for the swap actually asked for.
			//
			// This relaxes nothing the rounds that added these guards closed:
			// they move earlier-in-the-write, never later than it, and the two
			// directions fail closed into each other. A store that half answered
			// leaves `oauthOf(ownerNow)` absent or stale, which makes
			// `wouldRegress` FALSE — which is exactly the path that arrives here
			// and refuses.
			//
			// A credential file that is there but unreadable reads as absent, and
			// writing goes through a rename, which needs only directory
			// permission — so the save-back would replace an intact store it
			// never saw, with no backup and no way to know it had regressed.
			if (ownerRead.fileUnreadable) {
				return failure(
					"invalid-owner",
					`${ownerRead.credentialsPath} exists but could not be read; refusing to write over it`,
				);
			}
			// The save-back reaches the same write, so it needs the same Keychain
			// guard: an item that could not be read is not an absent one, and
			// taking it for absent overwrites the owner's login in place without a
			// backup and has the rollback delete it.
			if (ownerRead.keychainUnreadable) {
				return failure(
					"invalid-owner",
					`${keychainStoreName(ownerRead, ownerBinding, ctx)}'s Keychain item exists but could not be read; refusing to write over it`,
				);
			}
			// And of the re-read, both halves: this is the snapshot the write
			// merges and the rollback restores from, so a read that failed only
			// now is the one that would destroy the store.
			if (ownerNow.fileUnreadable) {
				return failure(
					"invalid-owner",
					`${ownerNow.credentialsPath} exists but could not be read; refusing to write over it`,
				);
			}
			if (ownerNow.keychainUnreadable) {
				return failure(
					"invalid-owner",
					`${keychainStoreName(ownerNow, ownerBinding, ctx)}'s Keychain item exists but could not be read; refusing to write over it`,
				);
			}
			const planned = await planStoreWrite(ownerBinding, ownerNow, ctx);
			if (!planned.ok) return planned.result;
			const ownerStatePath = claudeStatePath(
				configDirOf(ownerBinding),
				ctx.homeDir,
			);
			// The file write follows the store the login was read from, and for
			// the system default that is either half of the one slot —
			// `~/.config/claude` is a dir `storeDir` never names. Validate the
			// dir the credential and its backups actually land in, in the
			// moment before they do.
			if (planned.plan.file) {
				const pathInvalid = await validateDir(
					dirname(ownerNow.credentialsPath),
					ctx,
				);
				if (pathInvalid) return failure("invalid-owner", pathInvalid);
			}
			// The identity write lands somewhere else, and the check above cannot
			// stand in for it in either direction. For the system default the two
			// dirs differ — the credential may live in `~/.config/claude` while
			// `.claude.json` sits in `$HOME` — which is why the check above is not
			// simply made unconditional. And a keychain-only owner plans no file
			// write at all, so gating on `plan.file` alone would leave the state
			// file's dir unjudged and let this create a `.claude.json` in a
			// group-writable dir. Asked whenever that write runs, and before
			// anything lands, so a refusal still writes nothing.
			if (Object.keys(activeIdentity).length > 0) {
				const stateDirInvalid = await validateDir(
					dirname(ownerStatePath),
					ctx,
				);
				if (stateDirInvalid) return failure("invalid-owner", stateDirInvalid);
			}
			// A login is two halves here exactly as it is in the active dir, and
			// the save-back wrote only one. `ownerStoreMismatch` waves an empty
			// owner store through because "the save-back is what fills it" — and
			// what it filled it with was a credential no `.claude.json` names,
			// which is the one store shape this protocol refuses in both
			// directions: `no-target-identity` when the user swaps back into it,
			// `owner-unknown` when it is named as the owner. Snapshot the owner's
			// own block before anything lands, and fail closed on a read that
			// failed, for the reason the active dir does: the identity write below
			// deletes these keys by name before it writes, so running it on a read
			// that returned nothing would drop an account this could not put back.
			const ownerIdentityBefore = await readIdentityKeys(ownerStatePath, ctx);
			if (ownerIdentityBefore === null) {
				return failure(
					"invalid-owner",
					`${ownerStatePath} exists but could not be read; refusing to write an identity over it`,
				);
			}
			// The identity that belongs with the login being saved is the one
			// beside it in the active dir, read in the pre-flight above. No keys
			// means the active dir names no account — which `activeIdentityMismatch`
			// already refuses whenever the caller offered an expectation, so
			// reaching here means it offered none, and the credential goes back
			// alone exactly as it does today rather than the save-back erasing the
			// owner's own identity. Unless the owner has no identity of its own to
			// keep: then "alone" is the stranded store again, reached this time
			// with no I/O error anywhere, and the owner's login ends up reachable
			// by nothing while the active dir is given the target's.
			if (
				Object.keys(activeIdentity).length === 0 &&
				Object.keys(ownerIdentityBefore).length === 0
			) {
				return failure(
					"owner-unknown",
					`${input.activeDir} names no account and neither does ${storeDir(ownerBinding, ctx)}; refusing to save back a login no identity would name`,
				);
			}
			// The owner's dir has the same two stores as the active one, and the
			// same halfway failure: the file lands first, so a Keychain error after
			// it leaves the owner holding the rotated login in one store and the
			// pre-rotation one in the other, while the caller is told nothing landed.
			const ownerWritten: StoreWritePlan = { file: false, keychain: null };
			try {
				await applyStoreWrite(
					ownerNow,
					planned.plan,
					current,
					ctx,
					ownerWritten,
				);
			} catch (error) {
				return rollbackActiveWrite(
					ownerNow,
					ownerWritten,
					storeDir(ownerBinding, ctx),
					`saving the previous login back to ${storeDir(ownerBinding, ctx)} failed: ${errorText(error)}`,
					"write-failed",
					ctx,
				);
			}
			if (Object.keys(activeIdentity).length > 0) {
				try {
					// The same read-modify-write `applyToActiveDir` uses, so the
					// owner's onboarding flag and per-project trust survive being
					// given back its account.
					await updateClaudeStateFile(ownerStatePath, (state) => {
						for (const key of CLAUDE_IDENTITY_KEYS) delete state[key];
						return { ...state, ...activeIdentity };
					});
				} catch (error) {
					// Take the credential back out: an owner holding a login its
					// state file cannot name is the shape both later swaps refuse,
					// so half a save-back is worse than none.
					//
					// No `previousIdentity` here, deliberately, and for the reason
					// `applyToActiveDir` passes none from its own identity-write
					// catch: `updateClaudeStateFile` is tmp-then-rename, so a throw
					// left the owner's block exactly as `ownerIdentityBefore` read
					// it and there is nothing to put back. Passing it would also be
					// worse than useless twice over — whatever made this write throw
					// makes the restore throw on the same file, turning a rollback
					// that DID undo the credential into `split-state`, whose meaning
					// ("putting the previous login back failed too") would be untrue;
					// and an empty snapshot is `{}`, which is truthy, so the restore
					// would create a `.claude.json` in an owner dir the save-back
					// never otherwise writes.
					return rollbackActiveWrite(
						ownerNow,
						ownerWritten,
						storeDir(ownerBinding, ctx),
						`saving the previous login's identity back to ${storeDir(ownerBinding, ctx)} failed: ${errorText(error)}`,
						"write-failed",
						ctx,
					);
				}
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
