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
): Promise<{ paths: string[]; ok: boolean }> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return {
			paths: entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(dir, entry.name)),
			ok: true,
		};
	} catch {
		return { paths: [], ok: false };
	}
}

/** `ok` is false when the home dir itself could not be listed: an empty
 * candidate list is then a failed scan, not proof that every profile is gone.
 * A missing `~/.config` is ordinary and does not count. */
async function candidateDirectories(): Promise<{
	paths: string[];
	ok: boolean;
}> {
	const home = homedir();
	const homeListing = await listSubdirectories(home);
	const dotDirs = homeListing.paths.filter((path) =>
		path.slice(home.length + 1).startsWith("."),
	);
	const configDirs = (await listSubdirectories(join(home, ".config"))).paths;
	return { paths: [...dotDirs, ...configDirs].sort(), ok: homeListing.ok };
}

interface ClaudeStateFile {
	oauthAccount?: { emailAddress?: string; accountUuid?: string };
}

/** The OAuth identity a custom config dir keeps in its own `.claude.json`
 * (the system default keeps its next door — see claudeStatePath). */
export async function readClaudeIdentity(
	configDir: string,
): Promise<{ email: string | null; accountId: string | null } | null> {
	const statePath = join(configDir, ".claude.json");
	try {
		const info = await stat(statePath);
		if (!info.isFile() || info.size > MAX_STATE_FILE_BYTES) return null;
		const parsed: ClaudeStateFile = JSON.parse(
			await readFile(statePath, "utf-8"),
		);
		const account = parsed.oauthAccount;
		if (!account?.accountUuid && !account?.emailAddress) return null;
		return {
			email: account.emailAddress ?? null,
			accountId: account.accountUuid ?? null,
		};
	} catch {
		return null;
	}
}

/** The marker's mtime, or null when the dir is not API-billed for `agent`. */
export async function readApiBillingFingerprint(
	profileDir: string,
	agent: "claude" | "codex",
): Promise<string | null> {
	const markerPath = join(profileDir, API_BILLING_MARKER);
	try {
		const info = await stat(markerPath);
		if (!info.isFile() || info.size > MAX_MARKER_BYTES) return null;
		const content = (await readFile(markerPath, "utf-8")).trim();
		return content === agent ? `${info.mtimeMs}` : null;
	} catch {
		return null;
	}
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
): Promise<{ profiles: ClaudeProfile[]; complete: boolean }> {
	const home = homedir();
	const excluded = new Set([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	const started = Date.now();
	const profiles: ClaudeProfile[] = [];
	const activeDir = await canonicalPath(activeClaudeConfigDirPath());

	const scan = candidates
		? { paths: candidates, ok: true }
		: await candidateDirectories();
	for (const candidate of scan.paths) {
		if (Date.now() - started > SCAN_TIME_BUDGET_MS) {
			return { profiles, complete: false };
		}
		if (excluded.has(candidate)) continue;
		if ((await canonicalPath(candidate)) === activeDir) continue;
		const [identity, apiFingerprint] = await Promise.all([
			readClaudeIdentity(candidate),
			readApiBillingFingerprint(candidate, "claude"),
		]);
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
	return { profiles, complete: scan.ok };
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
	return (await readKeychainHits(service)).map((hit) => hit.secret);
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

/**
 * The same probe readKeychainSecrets has always done, but reporting which
 * account attribute matched: a login swap writes back into the item it read,
 * and `add-generic-password` filed under the wrong `-a` creates a second item
 * instead of updating the CLI's own.
 */
export async function readKeychainHits(
	service: string,
	access: KeychainAccess = {},
): Promise<KeychainHit[]> {
	if (!(access.darwin ?? platform() === "darwin")) return [];
	const exec = access.exec ?? runSecurity;
	const hits: KeychainHit[] = [];
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
		} catch {
			// No item under this scope.
		}
	}
	return hits;
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

function expiry(content: ClaudeCredentialJson | null): number {
	const oauth = content?.claudeAiOauth;
	const value = (oauth as { expiresAt?: unknown } | undefined)?.expiresAt;
	return typeof value === "number" ? value : 0;
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
 * Whether `candidate` is the newer of two copies of one login, by the same
 * two expiries claude-login-swap's non-regression check uses — so the store
 * this read names is the store a save-back would agree is newest.
 */
function isFresherLogin(
	candidate: ClaudeCredentialJson | null,
	current: ClaudeCredentialJson | null,
): boolean {
	if (!current) return true;
	return ["expiresAt", "refreshTokenExpiresAt"].some(
		(key) => loginTimestamp(candidate, key) > loginTimestamp(current, key),
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
	for (const path of paths) {
		const parsed = await read(path, "utf-8").then(
			parseCredentialJson,
			() => null,
		);
		if (!parsed) continue;
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
	// Every spelling is probed, never just the first that hits: a dir the user
	// re-spelled leaves a stale item filed under the old hash, and stopping
	// there would swap that old login in and name it as the write target.
	for (const service of services) {
		for (const hit of await readKeychainHits(service, access)) {
			const parsed = parseCredentialJson(hit.secret);
			if (!hasLogin(parsed)) continue;
			if (!isFresherLogin(parsed, keychainContent)) continue;
			keychainService = service;
			keychainAccount = hit.account;
			keychainContent = parsed;
		}
	}

	const fileLogin = hasLogin(fileContent) ? fileContent : null;
	const keychainLogin = hasLogin(keychainContent) ? keychainContent : null;
	const keychainWins =
		keychainLogin !== null &&
		(fileLogin === null || expiry(keychainLogin) > expiry(fileLogin));
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
export async function readCodexProfileKind(
	codexHome: string,
): Promise<Pick<
	CodexHome,
	"credentialKind" | "loginFingerprint" | "accountId"
> | null> {
	const apiFingerprint = await readApiBillingFingerprint(codexHome, "codex");
	if (apiFingerprint) {
		return {
			credentialKind: "api_key",
			loginFingerprint: apiFingerprint,
			accountId: null,
		};
	}
	try {
		const parsed: CodexAuthShape = JSON.parse(
			await readFile(join(codexHome, "auth.json"), "utf-8"),
		);
		return parsed.tokens?.access_token
			? {
					credentialKind: "subscription",
					loginFingerprint: null,
					accountId: parsed.tokens.account_id ?? null,
				}
			: null;
	} catch {
		// No parsable auth.json — not a Codex home.
		return null;
	}
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
	const defaultKind = (await readCodexProfileKind(defaultHome)) ?? {
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

	let complete = true;
	let scanned = candidates;
	if (!scanned) {
		const listing = await listSubdirectories(home);
		complete = listing.ok;
		scanned = listing.paths.filter((path) =>
			path.slice(home.length + 1).startsWith(".codex"),
		);
	}
	for (const candidate of scanned) {
		if (homes.has(candidate)) continue;
		const kind = await readCodexProfileKind(candidate);
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
