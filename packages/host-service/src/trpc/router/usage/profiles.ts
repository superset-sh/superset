/**
 * Auto-discovery of extra AI CLI logins — the homes users point
 * CLAUDE_CONFIG_DIR / CODEX_HOME at for multi-account setups (runway's
 * discovery model, ported from its ClaudeConfigDirDiscovery):
 *
 * - Candidates are dot-dirs at `~` plus dirs under `~/.config` — bounded,
 *   never temp dirs or project trees.
 * - A Claude candidate counts when its own `.claude.json` names an OAuth
 *   account ("identity-extraction-is-validation" — keeps forks and sandbox
 *   homes out), or when Superset's API-billing login command finished and
 *   left its marker file. Custom config dirs keep state INSIDE the dir; only
 *   the default `~/.claude` keeps it next door at `~/.claude.json`.
 * - API-billed profiles (Anthropic Console, `codex login --with-api-key`)
 *   are recognised by the marker alone. Their credential files are never
 *   opened: there is no quota to fetch, and the key should not pass through
 *   Superset.
 * - Credentials come from the dir's `.credentials.json` or its per-profile
 *   Keychain item: Claude Code hashes the literal CLAUDE_CONFIG_DIR string,
 *   so the service is `Claude Code-credentials-<sha256(literal)[0..8)>` and
 *   several path spellings must be probed (`~/x` vs absolute differ). Items
 *   are keyed on the login user's account too — see readKeychainSecrets.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, platform, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveAmbientCodexHome } from "@superset/agent-setup";
import { activeClaudeConfigDirPath } from "./default-account.ts";

const execFileAsync = promisify(execFile);

const SCAN_TIME_BUDGET_MS = 1_500;
const MAX_STATE_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Written inside a profile dir by the add-account command once the
 * provider's API-billing login succeeds (the renderer's addAccountCommand
 * appends it). It holds the agent id, so a marked `~/.codex-*` home is never
 * mistaken for a Claude profile by the broader Claude dot-dir scan. Its
 * mtime is the login fingerprint, since a re-login rewrites it.
 */
export const API_BILLING_MARKER = ".superset-api-billing";
const MAX_MARKER_BYTES = 64;

export type ProfileCredentialKind = "subscription" | "api_key";

export interface ClaudeProfile {
	/** Absolute config dir path (the CLAUDE_CONFIG_DIR value's expansion). */
	configDir: string;
	/** `~`-relative label for display. */
	sourceLabel: string;
	email: string | null;
	/** KTD4: `oauthAccount.accountUuid`, the identity that keys this account
	 * across dirs. Null for an API-billed profile, which has no OAuth login. */
	accountId: string | null;
	credentialKind: ProfileCredentialKind;
	/** API profiles only: changes when the login command completes again. */
	loginFingerprint: string | null;
	credentialsPath: string;
	/** Keychain service names to probe when the file has no token. */
	keychainServices: string[];
}

export interface CodexHome {
	home: string;
	sourceLabel: string;
	credentialKind: ProfileCredentialKind;
	/** KTD4: `tokens.account_id` from auth.json — the ChatGPT account this
	 * home is signed in as. Null for an API-billed home, whose auth.json is
	 * never opened. */
	accountId: string | null;
	/** API profiles only; derived from the marker, never from auth.json. */
	loginFingerprint: string | null;
}

function tildeLabel(path: string): string {
	return path.replace(homedir(), "~");
}

function hashSuffix(literal: string): string {
	return createHash("sha256")
		.update(literal.normalize("NFC"), "utf8")
		.digest("hex")
		.slice(0, 8);
}

/** Every plausible spelling Claude Code might have hashed for this dir. */
export function keychainServicesForConfigDir(configDir: string): string[] {
	const home = homedir();
	const spellings = new Set<string>([configDir]);
	if (configDir.startsWith(home)) {
		spellings.add(`~${configDir.slice(home.length)}`);
		spellings.add(`$HOME${configDir.slice(home.length)}`);
	}
	if (configDir.endsWith("/")) spellings.add(configDir.slice(0, -1));
	else spellings.add(`${configDir}/`);
	return [...spellings].map(
		(spelling) => `Claude Code-credentials-${hashSuffix(spelling)}`,
	);
}

/**
 * Subdirectories of `dir`, and whether the listing itself succeeded — an
 * unreadable dir yields the same empty list as an empty one, and a caller
 * whose result feeds a reaper has to tell those two apart.
 */
async function listSubdirectories(
	dir: string,
): Promise<{ paths: string[]; ok: boolean; missing: boolean }> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return {
			paths: entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(dir, entry.name)),
			ok: true,
			missing: false,
		};
	} catch (error) {
		// "Not there" and "there but unreadable" are different answers: the
		// first is an ordinary empty result, the second is a failed scan.
		const code = (error as NodeJS.ErrnoException).code ?? "";
		return {
			paths: [],
			ok: false,
			missing: code === "ENOENT" || code === "ENOTDIR",
		};
	}
}

/** `ok` is false when the home dir itself could not be listed: an empty
 * candidate list is then a failed scan, not proof that every profile is gone.
 * A missing `~/.config` is ordinary and does not count. */
async function candidateDirectories(home: string): Promise<{
	paths: string[];
	ok: boolean;
}> {
	const homeListing = await listSubdirectories(home);
	const dotDirs = homeListing.paths.filter((path) =>
		path.slice(home.length + 1).startsWith("."),
	);
	const configListing = await listSubdirectories(join(home, ".config"));
	return {
		paths: [...dotDirs, ...configListing.paths].sort(),
		ok: homeListing.ok && (configListing.ok || configListing.missing),
	};
}

interface ClaudeStateFile {
	oauthAccount?: { emailAddress?: string; accountUuid?: string };
}

/** A read that found nothing, told apart from a read that failed. Most
 * candidates are ordinary dot-dirs holding no such file at all, and those must
 * not spoil the walk; a file that is there but unreadable must, because a
 * caller that reaps whatever is missing would otherwise delete a live account
 * over a torn write or a momentary EACCES. */
interface ProfileRead<T> {
	value: T | null;
	unreadable: boolean;
}

/** ENOENT/ENOTDIR is the normal answer for a dir that simply has no such
 * file. Anything else means we were denied or the read broke. */
function absent(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code ?? "";
	return code === "ENOENT" || code === "ENOTDIR";
}

async function readClaudeIdentityWithStatus(
	configDir: string,
): Promise<ProfileRead<{ email: string | null; accountId: string | null }>> {
	const statePath = join(configDir, ".claude.json");
	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(statePath);
	} catch {
		// Every dot-dir in the home is a candidate, most of them nothing to do
		// with Claude. A dir we cannot even search (a root-owned 0700 left by
		// sudo, a dead FUSE mount) would otherwise pin the walk incomplete for
		// the life of the process and disable reaping entirely — far worse
		// than missing a profile, which the next pass re-adds. The CLI could
		// not use such a dir as a CLAUDE_CONFIG_DIR either, so it hides
		// nothing usable.
		return { value: null, unreadable: false };
	}
	// A directory or socket at that path is not a profile we are hiding.
	if (!info.isFile()) {
		return { value: null, unreadable: false };
	}
	// An oversized state file is the opposite case: the file is there and we
	// refuse to parse it, so a profile that exists stays invisible. That must
	// spoil the walk like any other unreadable state file — a state file only
	// grows, so a reaper told the walk was whole would delete a live account's
	// records and no later pass would ever bring it back.
	if (info.size > MAX_STATE_FILE_BYTES) {
		return { value: null, unreadable: true };
	}
	try {
		const parsed: ClaudeStateFile = JSON.parse(
			await readFile(statePath, "utf-8"),
		);
		const account = parsed.oauthAccount;
		if (!account?.accountUuid && !account?.emailAddress) {
			return { value: null, unreadable: false };
		}
		return {
			value: {
				email: account.emailAddress ?? null,
				accountId: account.accountUuid ?? null,
			},
			unreadable: false,
		};
	} catch (error) {
		// stat already said regular file, so a failure here is a denied read
		// or a torn write — both of which hide a profile that exists.
		return { value: null, unreadable: !absent(error) };
	}
}

/** The OAuth identity a custom config dir keeps in its own `.claude.json`
 * (the system default keeps its next door — see claudeStatePath). */
export async function readClaudeIdentity(
	configDir: string,
): Promise<{ email: string | null; accountId: string | null } | null> {
	return (await readClaudeIdentityWithStatus(configDir)).value;
}

async function readApiBillingFingerprintWithStatus(
	profileDir: string,
	agent: "claude" | "codex",
): Promise<ProfileRead<string>> {
	const markerPath = join(profileDir, API_BILLING_MARKER);
	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(markerPath);
	} catch {
		// Same reasoning as readClaudeIdentityWithStatus: an unsearchable dir
		// is not a profile we are hiding.
		return { value: null, unreadable: false };
	}
	if (!info.isFile() || info.size > MAX_MARKER_BYTES) {
		return { value: null, unreadable: false };
	}
	try {
		const content = (await readFile(markerPath, "utf-8")).trim();
		return {
			value: content === agent ? `${info.mtimeMs}` : null,
			unreadable: false,
		};
	} catch (error) {
		return { value: null, unreadable: !absent(error) };
	}
}

/** The marker's mtime, or null when the dir is not API-billed for `agent`. */
export async function readApiBillingFingerprint(
	profileDir: string,
	agent: "claude" | "codex",
): Promise<string | null> {
	return (await readApiBillingFingerprintWithStatus(profileDir, agent)).value;
}

/** Realpath, falling back to a plain resolve for a path that does not exist
 * yet — the active dir is created lazily. */
async function canonicalPath(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

/**
 * KTD4: the Superset-owned active dir (KTD2) holds a copy of whichever
 * account is active, so discovering it would list that account twice — the
 * second time under a dir that is nobody's login. Compared by realpath: the
 * env may spell it differently, and $SUPERSET_HOME_DIR can itself sit under a
 * scanned dir or behind a symlink.
 */
export async function isActiveClaudeConfigDir(dir: string): Promise<boolean> {
	return (
		(await canonicalPath(dir)) ===
		(await canonicalPath(activeClaudeConfigDirPath()))
	);
}

/**
 * Extra Claude profile dirs beyond the defaults, and whether the walk reached
 * every candidate. Default homes are excluded — callers already cover
 * `~/.claude` and `~/.config/claude`. `candidates` overrides the home-dir scan
 * for tests.
 *
 * `complete` is false when the scan-time budget cut the walk short: the list
 * is then a subset of what is on disk, and a caller that reaps whatever is
 * missing from it (the quota store) would delete live accounts.
 */
export async function discoverClaudeProfilesWithStatus(
	candidates?: string[],
	homeDir?: string,
): Promise<{ profiles: ClaudeProfile[]; complete: boolean }> {
	const home = homeDir ?? homedir();
	const excluded = new Set([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	const started = Date.now();
	const profiles: ClaudeProfile[] = [];
	// A candidate we could not read is a profile we may be hiding, so the walk
	// stops claiming it saw everything — the reaper only deletes on a whole one.
	let readFailed = false;
	const activeDir = await canonicalPath(activeClaudeConfigDirPath());

	const scan = candidates
		? { paths: candidates, ok: true }
		: await candidateDirectories(home);
	for (const candidate of scan.paths) {
		if (Date.now() - started > SCAN_TIME_BUDGET_MS) {
			return { profiles, complete: false };
		}
		if (excluded.has(candidate)) continue;
		if ((await canonicalPath(candidate)) === activeDir) continue;
		const [identityRead, apiRead] = await Promise.all([
			readClaudeIdentityWithStatus(candidate),
			readApiBillingFingerprintWithStatus(candidate, "claude"),
		]);
		if (identityRead.unreadable || apiRead.unreadable) readFailed = true;
		const identity = identityRead.value;
		const apiFingerprint = apiRead.value;
		if (!identity && !apiFingerprint) continue;
		profiles.push({
			configDir: candidate,
			sourceLabel: tildeLabel(candidate),
			email: identity?.email ?? null,
			accountId: identity?.accountId ?? null,
			credentialKind: apiFingerprint ? "api_key" : "subscription",
			loginFingerprint: apiFingerprint,
			credentialsPath: join(candidate, ".credentials.json"),
			keychainServices: keychainServicesForConfigDir(candidate),
		});
	}
	return { profiles, complete: scan.ok && !readFailed };
}

/** The profiles alone, for callers with nothing to reap on a short list. */
export async function discoverClaudeProfiles(
	candidates?: string[],
): Promise<ClaudeProfile[]> {
	return (await discoverClaudeProfilesWithStatus(candidates)).profiles;
}

const KEYCHAIN_ACCOUNT_PATTERN = /^[a-zA-Z0-9._-]+$/;
const KEYCHAIN_ACCOUNT_FALLBACK = "claude-code-user";
/** What Bun's os.userInfo() reports as the user name when USER is unset. */
const BUN_USERINFO_FALLBACK = "unknown";

/**
 * The `-a` accounts Claude Code may file its Keychain items under, likeliest
 * first. The CLI uses `$USER`, else `os.userInfo().username`, and swaps a
 * name outside its pattern for a fixed fallback. Its native build runs on
 * Bun, whose userInfo() reports "unknown" instead of the passwd name, so a
 * CLI launched without USER (hand-built harness envs do this) keeps a
 * separate "unknown" identity, while the npm build on Node uses the real
 * name — without USER, both are probed.
 */
export function claudeKeychainAccounts(
	env: NodeJS.ProcessEnv = process.env,
	passwdName: () => string = () => userInfo().username,
): string[] {
	const validated = (name: string) =>
		KEYCHAIN_ACCOUNT_PATTERN.test(name) ? name : KEYCHAIN_ACCOUNT_FALLBACK;
	if (env.USER) return [validated(env.USER)];
	let fromPasswd: string;
	try {
		fromPasswd = validated(passwdName());
	} catch {
		fromPasswd = KEYCHAIN_ACCOUNT_FALLBACK;
	}
	return [...new Set([fromPasswd, BUN_USERINFO_FALLBACK])];
}

/**
 * Every distinct secret filed under a Keychain service; empty off macOS.
 * `security` returns one item per lookup, and a service can hold several:
 * Claude Code keys each on an account name (see claudeKeychainAccounts),
 * and a sibling identity — a CLI run without USER left an "unknown" item
 * holding only MCP OAuth tokens — is what an unscoped lookup returns first,
 * which made the real login vanish from the quota panel. The CLI's own
 * accounts are probed first; the unscoped lookup then covers items an older
 * client filed under a different name.
 */
export async function readKeychainSecrets(service: string): Promise<string[]> {
	return (await readKeychainHits(service)).hits.map((hit) => hit.secret);
}

/**
 * `security` with the arguments given, optionally fed a command on stdin
 * (`security -i`) so a secret never appears in argv, where any process on the
 * machine can read it. Injectable so the Keychain paths stay testable off
 * macOS.
 */
export type SecurityExec = (
	args: string[],
	stdin?: string,
) => Promise<{ stdout: string; stderr: string }>;

export interface KeychainAccess {
	exec?: SecurityExec;
	/** Overrides the platform check; the Keychain only exists on macOS. */
	darwin?: boolean;
}

export const runSecurity: SecurityExec = (args, stdin) => {
	const running = execFileAsync("security", args, { timeout: 5_000 });
	if (stdin !== undefined) running.child.stdin?.end(stdin);
	return running;
};

export interface KeychainHit {
	/** The `-a` attribute that matched, or null when only the unscoped probe
	 * found the item — a write has to resolve it before it can target the
	 * same item (see readKeychainAccountAttribute). */
	account: string | null;
	secret: string;
}

export interface KeychainProbe {
	hits: KeychainHit[];
	/**
	 * A scope rejected for a reason that is not an absent item, so an item may
	 * be sitting under this service unread. Empty `hits` then means "we could
	 * not look", never "there is nothing there".
	 */
	failed: boolean;
}

/** `security`'s exit status for errSecItemNotFound. */
const KEYCHAIN_ITEM_NOT_FOUND = 44;

/**
 * Whether a rejected lookup means the item is not there. `security` exits 44
 * and prints "could not be found" for an absent item and nothing else does:
 * the 5s timeout kills the process, a denied or unanswered Keychain prompt
 * exits 51, and a `security` that cannot run rejects with an errno. Anything
 * unrecognised is a failure, not an absence — the whole point of asking is
 * that mistaking one for the other lets a caller write over, and a rollback
 * delete, an item nobody read.
 */
function keychainItemAbsent(error: unknown): boolean {
	if ((error as { code?: unknown })?.code === KEYCHAIN_ITEM_NOT_FOUND) {
		return true;
	}
	const message = error instanceof Error ? error.message : "";
	return /could not be found|not found/i.test(message);
}

/**
 * The same probe readKeychainSecrets has always done, but reporting which
 * account attribute matched: a login swap writes back into the item it read,
 * and `add-generic-password` filed under the wrong `-a` creates a second item
 * instead of updating the CLI's own. A scope that failed rather than missed is
 * reported too, since the two are indistinguishable in `hits`.
 */
export async function readKeychainHits(
	service: string,
	access: KeychainAccess = {},
): Promise<KeychainProbe> {
	if (!(access.darwin ?? platform() === "darwin")) {
		return { hits: [], failed: false };
	}
	const exec = access.exec ?? runSecurity;
	const hits: KeychainHit[] = [];
	let failed = false;
	const scopes: Array<string | null> = [...claudeKeychainAccounts(), null];
	for (const account of scopes) {
		try {
			const { stdout } = await exec([
				"find-generic-password",
				...(account === null ? [] : ["-a", account]),
				"-s",
				service,
				"-w",
			]);
			const secret = stdout.trim();
			if (secret && !hits.some((hit) => hit.secret === secret)) {
				hits.push({ account, secret });
			}
		} catch (error) {
			// No item under this scope — or a probe that never got to look.
			if (!keychainItemAbsent(error)) failed = true;
		}
	}
	return { hits, failed };
}

/**
 * The `acct` attribute of the item under `service`, read from
 * `find-generic-password -g`'s attribute dump. Used only when the login was
 * found by an unscoped probe, so the write can target that exact item.
 */
export async function readKeychainAccountAttribute(
	service: string,
	access: KeychainAccess = {},
): Promise<string | null> {
	const exec = access.exec ?? runSecurity;
	try {
		const { stderr, stdout } = await exec([
			"find-generic-password",
			"-g",
			"-s",
			service,
		]);
		const match = /"acct"<blob>="([^"]*)"/.exec(`${stderr}\n${stdout}`);
		return match?.[1] ? match[1] : null;
	} catch {
		return null;
	}
}

/** The unscoped item the system-default login (`~/.claude`) lives in. */
export const CLAUDE_DEFAULT_KEYCHAIN_SERVICE = "Claude Code-credentials";

/** A parsed credential store: the OAuth login plus siblings like `mcpOAuth`. */
export interface ClaudeCredentialJson {
	claudeAiOauth?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ClaudeLoginRead {
	/** The freshest store's contents, or null when neither holds a login. */
	login: ClaudeCredentialJson | null;
	/** Which store `login` came from. */
	source: "file" | "keychain";
	credentialsPath: string;
	/** Parsed credential file, login or not — a swap preserves its siblings. */
	fileContent: ClaudeCredentialJson | null;
	fileLogin: ClaudeCredentialJson | null;
	keychainService: string | null;
	keychainAccount: string | null;
	keychainContent: ClaudeCredentialJson | null;
	keychainLogin: ClaudeCredentialJson | null;
	/**
	 * The store a write would target — `credentialsPath` — is there but could
	 * not be read or parsed: denied, mid-rewrite, or an I/O error. Distinct
	 * from "no file", which is an ordinary signed-out profile: a caller that
	 * writes must fail closed on this, because renaming over the path needs
	 * only directory permission and would replace an intact store it never
	 * saw. Also true when nothing was readable at all, since the path then
	 * falls back to the first candidate.
	 */
	fileUnreadable: boolean;
	/**
	 * ANY candidate path was there and could not be read, chosen or not. This
	 * is the READ question, where `fileUnreadable` above is the WRITE question:
	 * the system default's one slot has two candidate paths and only the chosen
	 * one is ever renamed over, so a torn sibling leaves the write target
	 * perfectly writable — but it may have held the NEWER login, which makes
	 * `login` here possibly the older of the two. A caller deciding WHICH login
	 * to move must fail closed on this one; a caller deciding whether it may
	 * write over `credentialsPath` still asks `fileUnreadable`, and asking this
	 * one there would refuse writes that are safe. For a profile dir, which has
	 * a single candidate, the two always agree.
	 */
	anyFileCandidateUnreadable: boolean;
	/**
	 * The candidate paths `anyFileCandidateUnreadable` is true FOR — the files
	 * a user would have to unlock or repair. Not `credentialsPath`, which names
	 * the store a write would target: that is the candidate that WON, so it is
	 * the readable one whenever the file half supplied the login, and when
	 * nothing was readable it falls back to the first candidate, which may
	 * simply be absent. Empty exactly when `anyFileCandidateUnreadable` is
	 * false.
	 */
	unreadableFileCandidates: string[];
	/**
	 * A Keychain probe for this dir rejected for a reason that is not an absent
	 * item: a denied or unanswered prompt, the 5s timeout, a `security` that
	 * could not run, or a secret read whole whose bytes would not parse.
	 * `keychainContent` is then null for the same reason a
	 * signed-out profile's is, and telling them apart is the caller's only
	 * defence: `add-generic-password -U` replaces an item's data in place with
	 * no backup and no sibling merge, and a rollback DELETES the item it
	 * believes was not there. A caller that writes must fail closed on this.
	 */
	keychainUnreadable: boolean;
	/**
	 * The spellings `keychainUnreadable` is true FOR — the items a user would
	 * have to unlock or delete. Not `keychainService`, which names whichever
	 * spelling held the freshest item that did parse: a refusal that named
	 * that one pointed at the item it read fine, and when nothing parsed there
	 * was no name at all. Empty exactly when `keychainUnreadable` is false.
	 */
	keychainUnreadableServices: string[];
}

function parseCredentialJson(raw: string): ClaudeCredentialJson | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		return parsed as ClaudeCredentialJson;
	} catch {
		return null;
	}
}

/**
 * A store counts as holding a login only with a usable token in it. A
 * `claudeAiOauth` left half-written (the CLI rewrites the whole object on
 * refresh) or emptied is not one: treating it as a login lists a phantom
 * account and, worse, lets a swap move that empty object into the active dir
 * and sign the session out.
 */
function hasLogin(content: ClaudeCredentialJson | null): boolean {
	const oauth = content?.claudeAiOauth;
	if (typeof oauth !== "object" || oauth === null || Array.isArray(oauth)) {
		return false;
	}
	const { accessToken, refreshToken } = oauth as {
		accessToken?: unknown;
		refreshToken?: unknown;
	};
	if (typeof accessToken !== "string" || accessToken === "") return false;
	// A refresh token is optional, but a present one has to be usable.
	return (
		refreshToken === undefined ||
		(typeof refreshToken === "string" && refreshToken !== "")
	);
}

function loginTimestamp(
	content: ClaudeCredentialJson | null,
	key: string,
): number {
	const oauth = content?.claudeAiOauth as Record<string, unknown> | undefined;
	const value = oauth?.[key];
	return typeof value === "number" ? value : 0;
}

/**
 * Whether `candidate` is the newer of two copies of one login.
 *
 * Ordered on `expiresAt` first, `refreshTokenExpiresAt` only as the tiebreak.
 * The CLI rewrites `claudeAiOauth` wholesale on every refresh and every login,
 * and `expiresAt` is the field that moves forward on all of them, so it is the
 * write clock; the refresh token's expiry moves only when the token rotates.
 * Asking whether EITHER is newer is not an ordering at all — for
 * {500,100} and {400,900} both directions are true, so the winner was whichever
 * happened to be probed second.
 *
 * This deliberately does NOT match claude-login-swap's non-regression check,
 * which stays a disjunction: "which snapshot is later" and "is it safe to write
 * over this one" are different questions, and refusing a write whenever the two
 * stores disagree on either axis is the right answer for the write.
 */
function isFresherLogin(
	candidate: ClaudeCredentialJson | null,
	current: ClaudeCredentialJson | null,
): boolean {
	if (!current) return true;
	const expires = loginTimestamp(candidate, "expiresAt");
	const currentExpires = loginTimestamp(current, "expiresAt");
	if (expires !== currentExpires) return expires > currentExpires;
	return (
		loginTimestamp(candidate, "refreshTokenExpiresAt") >
		loginTimestamp(current, "refreshTokenExpiresAt")
	);
}

/**
 * Where a login's credential store and identity file live. A custom config
 * dir keeps both inside itself; the system default (`selection: null`) keeps
 * credentials in `~/.claude` and its identity next door at `~/.claude.json`.
 */
export function claudeCredentialsPath(
	configDir: string | null,
	homeDir: string = homedir(),
): string {
	return join(configDir ?? join(homeDir, ".claude"), ".credentials.json");
}

/**
 * The files the system-default login can live in. `~/.claude` and
 * `~/.config/claude` are ONE slot the CLI writes whichever half it prefers
 * (fetchClaudeAccounts reads both the same way), so a read that opened only
 * the first would report a user signed in under the second as signed out —
 * and a save-back would write the login into the file the CLI is not reading.
 */
function claudeDefaultCredentialPaths(homeDir: string): string[] {
	return [
		claudeCredentialsPath(null, homeDir),
		join(homeDir, ".config", "claude", "credentials.json"),
	];
}

export function claudeStatePath(
	configDir: string | null,
	homeDir: string = homedir(),
): string {
	return configDir
		? join(configDir, ".claude.json")
		: join(homeDir, ".claude.json");
}

/**
 * The login held for one config dir (`null` = the system default), naming the
 * store it came from so a caller can write back into that same store. Both
 * stores are reported: on macOS a dir can hold a credential file and a
 * Keychain item at once, and a swap that updates only one leaves the CLI on
 * the other account.
 */
export async function readClaudeLogin(
	configDir: string | null,
	access: KeychainAccess & {
		homeDir?: string;
		/** Injectable so a caller can read through its own fs surface. */
		readFile?: (path: string, encoding: "utf-8") => Promise<string>;
	} = {},
): Promise<ClaudeLoginRead> {
	const read = access.readFile ?? readFile;
	const paths = configDir
		? [claudeCredentialsPath(configDir, access.homeDir)]
		: claudeDefaultCredentialPaths(access.homeDir ?? homedir());
	let credentialsPath = paths[0] as string;
	let fileContent: ClaudeCredentialJson | null = null;
	// Per path, not one flag for the read: the system default has two
	// candidate paths and only the chosen one is ever written, so a torn
	// sibling must not make an intact store look unwritable.
	const unreadable = new Set<string>();
	for (const path of paths) {
		const raw = await read(path, "utf-8").then(
			(text) => text,
			(error: unknown) => {
				// Missing is ordinary; denied, torn or EIO means a store we
				// cannot see is sitting there.
				if (!absent(error)) unreadable.add(path);
				return null;
			},
		);
		if (raw === null) continue;
		const parsed = parseCredentialJson(raw);
		// Bytes we read but could not parse are a store mid-rewrite, not an
		// absent one.
		if (!parsed) {
			unreadable.add(path);
			continue;
		}
		if (fileContent && !hasLogin(parsed)) continue;
		if (hasLogin(fileContent) && !isFresherLogin(parsed, fileContent)) continue;
		credentialsPath = path;
		fileContent = parsed;
	}

	const services = configDir
		? keychainServicesForConfigDir(configDir)
		: [CLAUDE_DEFAULT_KEYCHAIN_SERVICE];
	let keychainService: string | null = null;
	let keychainAccount: string | null = null;
	let keychainContent: ClaudeCredentialJson | null = null;
	let keychainUnreadable = false;
	// Which spelling, not just whether: a refusal has to name the item the
	// user must unlock or delete, and that is never the one that answered.
	const keychainUnreadableServices = new Set<string>();
	// Every spelling is probed, never just the first that hits: a dir the user
	// re-spelled leaves a stale item filed under the old hash, and stopping
	// there would swap that old login in and name it as the write target.
	for (const service of services) {
		const probe = await readKeychainHits(service, access);
		// Any spelling: the item the write would land in can be under any of
		// them, so one unreadable service makes the whole picture unreliable.
		if (probe.failed) {
			keychainUnreadable = true;
			keychainUnreadableServices.add(service);
		}
		for (const hit of probe.hits) {
			const parsed = parseCredentialJson(hit.secret);
			// Recorded login or not, exactly as the file loop above does: a
			// swap merges its siblings back and the rollback restores them,
			// and both read this field. Skipping a login-less item leaves the
			// write with nothing to merge, so it overwrites the item's
			// mcpOAuth tokens — and a failed verify deletes the item outright.
			// Bytes we read but could not parse, exactly as the file loop
			// above does: an item mid-rewrite, or holding a shape we do not
			// know, is not an absent one — the write would replace it in
			// place with no backup and the rollback would delete it.
			if (!parsed) {
				keychainUnreadable = true;
				keychainUnreadableServices.add(service);
				continue;
			}
			if (keychainContent && !hasLogin(parsed)) continue;
			if (hasLogin(keychainContent) && !isFresherLogin(parsed, keychainContent))
				continue;
			keychainService = service;
			keychainAccount = hit.account;
			keychainContent = parsed;
		}
	}

	const fileLogin = hasLogin(fileContent) ? fileContent : null;
	const keychainLogin = hasLogin(keychainContent) ? keychainContent : null;
	// The same ordering the within-store loops use, so the store this read
	// names is the later snapshot rather than whichever half was probed last.
	const keychainWins =
		keychainLogin !== null &&
		(fileLogin === null || isFresherLogin(keychainLogin, fileLogin));
	return {
		login: keychainWins ? keychainLogin : fileLogin,
		source: keychainWins ? "keychain" : "file",
		credentialsPath,
		fileContent,
		fileLogin,
		keychainService,
		keychainAccount,
		keychainContent,
		keychainLogin,
		// A non-chosen candidate is never renamed over, so only the write
		// target counts — unless nothing was readable, in which case the
		// target is the first candidate and the store there is still unseen.
		fileUnreadable:
			unreadable.has(credentialsPath) ||
			(fileContent === null && unreadable.size > 0),
		// The same set, asked the other question: a candidate we could not
		// read may have held the newer half of this one slot.
		anyFileCandidateUnreadable: unreadable.size > 0,
		unreadableFileCandidates: [...unreadable],
		keychainUnreadable,
		keychainUnreadableServices: [...keychainUnreadableServices],
	};
}

interface CodexAuthShape {
	tokens?: { access_token?: string; account_id?: string };
}

/**
 * How a Codex home is billed, or null when it holds no usable login. The
 * marker is checked first so an API-billed home's auth.json (which holds
 * the raw key) is never opened.
 */
type CodexProfileKind = Pick<
	CodexHome,
	"credentialKind" | "loginFingerprint" | "accountId"
>;

async function readCodexProfileKindWithStatus(
	codexHome: string,
): Promise<ProfileRead<CodexProfileKind>> {
	const apiRead = await readApiBillingFingerprintWithStatus(codexHome, "codex");
	if (apiRead.value) {
		return {
			value: {
				credentialKind: "api_key",
				loginFingerprint: apiRead.value,
				accountId: null,
			},
			unreadable: false,
		};
	}
	const authPath = join(codexHome, "auth.json");
	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(authPath);
	} catch {
		// Same rule as the Claude walk: a dir we cannot even search is not a
		// home we are hiding, and counting it as unreadable would pin the walk
		// incomplete for the life of the process and disable reaping for the
		// whole agent. The default home comes through here with no name filter
		// at all, so this is not only about ~/.codex* siblings.
		return { value: null, unreadable: apiRead.unreadable };
	}
	if (!info.isFile()) {
		return { value: null, unreadable: apiRead.unreadable };
	}
	try {
		const parsed: CodexAuthShape = JSON.parse(
			await readFile(authPath, "utf-8"),
		);
		return {
			value: parsed.tokens?.access_token
				? {
						credentialKind: "subscription",
						loginFingerprint: null,
						accountId: parsed.tokens.account_id ?? null,
					}
				: null,
			unreadable: apiRead.unreadable,
		};
	} catch (error) {
		// A missing auth.json means this is not a Codex home; a denied or torn
		// read means it may be one we are hiding.
		return { value: null, unreadable: apiRead.unreadable || !absent(error) };
	}
}

export async function readCodexProfileKind(
	codexHome: string,
): Promise<CodexProfileKind | null> {
	return (await readCodexProfileKindWithStatus(codexHome)).value;
}

/**
 * Codex homes: the ambient home (`~/.codex`, or a `CODEX_HOME` the user set
 * themselves — see resolveAmbientCodexHome for why Superset's own injected
 * value is ignored) plus any `~/.codex*` dot-dir carrying an `auth.json` with
 * a token or the API-billing marker. The common multi-account convention is
 * one CODEX_HOME dir per account.
 *
 * The first entry is the system default, and `fetchCodexAccounts` gives it
 * `selection: null`. It is listed even without an `auth.json` so the
 * add-account poller has a baseline to compare a fresh `codex login` against.
 *
 * `complete` is false when the `~` listing failed: the walk then saw no
 * dot-dirs at all, which on its own is indistinguishable from a home holding
 * none, so a caller that reaps whatever is missing would delete every
 * non-default home. `candidates` and `homeDir` override the scan for tests.
 */
export async function discoverCodexHomesWithStatus({
	candidates,
	homeDir,
}: {
	candidates?: string[];
	homeDir?: string;
} = {}): Promise<{
	homes: CodexHome[];
	complete: boolean;
}> {
	const home = homeDir ?? homedir();
	const defaultHome = resolveAmbientCodexHome(home);
	// Status-preserving, like every sibling below: an unreadable default
	// auth.json would otherwise be published as a subscription home signed in
	// as nobody, while the walk still claimed it saw everything.
	const defaultRead = await readCodexProfileKindWithStatus(defaultHome);
	const defaultKind = defaultRead.value ?? {
		credentialKind: "subscription" as const,
		loginFingerprint: null,
		accountId: null,
	};
	const homes = new Map<string, CodexHome>([
		[
			defaultHome,
			{
				home: defaultHome,
				sourceLabel: tildeLabel(defaultHome),
				...defaultKind,
			},
		],
	]);

	let complete = !defaultRead.unreadable;
	let scanned = candidates;
	if (!scanned) {
		const listing = await listSubdirectories(home);
		complete &&= listing.ok;
		scanned = listing.paths.filter((path) =>
			path.slice(home.length + 1).startsWith(".codex"),
		);
	}
	for (const candidate of scanned) {
		if (homes.has(candidate)) continue;
		const read = await readCodexProfileKindWithStatus(candidate);
		if (read.unreadable) complete = false;
		const kind = read.value;
		if (!kind) continue;
		homes.set(candidate, {
			home: candidate,
			sourceLabel: tildeLabel(candidate),
			...kind,
		});
	}
	return { homes: [...homes.values()], complete };
}

/** The homes alone, for callers with nothing to reap on a short list. */
export async function discoverCodexHomes(
	candidates?: string[],
): Promise<CodexHome[]> {
	return (await discoverCodexHomesWithStatus({ candidates })).homes;
}
