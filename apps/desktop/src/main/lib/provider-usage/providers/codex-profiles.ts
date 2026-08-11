import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	accessSync,
	chmodSync,
	constants,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
} from "node:fs";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type {
	ProviderUsageAccount,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";
import { getProcessEnvWithShellPath } from "lib/trpc/routers/workspaces/utils/shell-env";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";

const CODEX_LOGIN_TIMEOUT_MS = 10 * 60_000;
const CODEX_BACKUP_RETENTION = 5;

export interface CodexIdentity {
	accountId: string;
	email: string | null;
	plan: string | null;
}

export interface CodexProfile {
	profileName: string;
	identity: CodexIdentity;
	isActive: boolean;
}

export interface CodexUsageSnapshot {
	accountId: string;
	capturedAt: number;
	planLabel: string | null;
	windows: UsageWindow[];
}

export interface CodexProfileStoreOptions {
	rootDir?: string;
	homeDir?: string;
	now?: () => Date;
	randomId?: () => string;
	getEnv?: () => Promise<Record<string, string>>;
}

function ensureDir(path: string): void {
	mkdirSync(path, { recursive: true, mode: SUPERSET_HOME_DIR_MODE });
}

function chmodSensitive(path: string): void {
	try {
		chmodSync(path, SUPERSET_SENSITIVE_FILE_MODE);
	} catch {
		// Best effort; the write path still remains app-owned.
	}
}

async function copySensitiveFileAtomically(
	source: string,
	destination: string,
	tempPath: string,
): Promise<void> {
	try {
		await copyFile(source, tempPath);
		chmodSensitive(tempPath);
		renameSync(tempPath, destination);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}
	chmodSensitive(destination);
}

async function writeSensitiveFileAtomically(
	destination: string,
	contents: string,
	tempPath: string,
): Promise<void> {
	try {
		await writeFile(tempPath, contents, {
			mode: SUPERSET_SENSITIVE_FILE_MODE,
		});
		chmodSensitive(tempPath);
		renameSync(tempPath, destination);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}
	chmodSensitive(destination);
}

function base64UrlDecode(value: string): Buffer {
	const padded = value.padEnd(
		value.length + ((4 - (value.length % 4)) % 4),
		"=",
	);
	return Buffer.from(
		padded.replaceAll("-", "+").replaceAll("_", "/"),
		"base64",
	);
}

export function parseCodexIdentity(authJson: string): CodexIdentity | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(authJson);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const tokens = (parsed as { tokens?: unknown }).tokens;
	if (!tokens || typeof tokens !== "object") return null;
	const tokenRecord = tokens as {
		account_id?: unknown;
		id_token?: unknown;
	};

	let email: string | null = null;
	let plan: string | null = null;
	let claimAccountId: string | null = null;
	if (typeof tokenRecord.id_token === "string") {
		const [, payload] = tokenRecord.id_token.split(".");
		if (payload) {
			try {
				const claims = JSON.parse(
					base64UrlDecode(payload).toString("utf8"),
				) as {
					email?: unknown;
					"https://api.openai.com/auth"?: {
						chatgpt_account_id?: unknown;
						chatgpt_plan_type?: unknown;
					};
				};
				email = typeof claims.email === "string" ? claims.email : null;
				const auth = claims["https://api.openai.com/auth"];
				claimAccountId =
					typeof auth?.chatgpt_account_id === "string"
						? auth.chatgpt_account_id
						: null;
				plan =
					typeof auth?.chatgpt_plan_type === "string"
						? auth.chatgpt_plan_type
						: null;
			} catch {
				// Older auth files can still carry account_id without a usable JWT.
			}
		}
	}

	const accountId =
		typeof tokenRecord.account_id === "string"
			? tokenRecord.account_id
			: claimAccountId;
	return accountId ? { accountId, email, plan } : null;
}

function normalizeProfileName(source: string): string {
	const normalized = source
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "");
	return normalized || "codex-account";
}

function assertSafeProfileName(profileName: string): void {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(profileName)) {
		throw new Error("Codex profile name is invalid.");
	}
}

function suggestedProfileName(
	identity: CodexIdentity,
	existingAccountIdsByName: Map<string, string>,
): string {
	for (const [name, accountId] of [
		...existingAccountIdsByName.entries(),
	].sort()) {
		if (accountId === identity.accountId) return name;
	}

	const base = normalizeProfileName(
		identity.email || identity.accountId.slice(0, 8),
	);
	if (!existingAccountIdsByName.has(base)) return base;
	let suffix = 2;
	while (existingAccountIdsByName.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
}

export function projectCachedWindows(
	snapshot: CodexUsageSnapshot,
	now = Date.now(),
): UsageWindow[] {
	return snapshot.windows.filter(
		(window) => window.resetAt === null || window.resetAt > now,
	);
}

function findCodexExecutable(env = process.env): string | null {
	const executableNames =
		process.platform === "win32"
			? ["codex.cmd", "codex.exe", "codex"]
			: ["codex"];
	const candidates = [
		env.CCM_CODEX_EXECUTABLE,
		join(homedir(), ".local", "bin", "codex"),
		"/opt/homebrew/bin/codex",
		"/usr/local/bin/codex",
		...(env.PATH?.split(delimiter).flatMap((entry) =>
			executableNames.map((name) => join(entry, name)),
		) ?? []),
	].filter((value): value is string => Boolean(value));
	return (
		candidates.find((path) => {
			try {
				accessSync(path, constants.X_OK);
				return true;
			} catch {
				return false;
			}
		}) ?? null
	);
}

export function createCodexProfileStore(
	options: CodexProfileStoreOptions = {},
) {
	const rootDir = options.rootDir ?? SUPERSET_HOME_DIR;
	const homeDir = options.homeDir ?? homedir();
	const now = options.now ?? (() => new Date());
	const randomId = options.randomId ?? randomUUID;
	const getEnv = options.getEnv ?? getProcessEnvWithShellPath;
	const storeRoot = join(rootDir, "provider-usage", "codex");
	const profilesDir = join(storeRoot, "profiles");
	const backupsDir = join(storeRoot, "backups");
	const loginDir = join(storeRoot, "login");
	const snapshotsPath = join(storeRoot, "snapshots.json");
	const activeAuthPath = join(homeDir, ".codex", "auth.json");

	function ensureStore(): void {
		ensureDir(profilesDir);
		ensureDir(backupsDir);
		ensureDir(loginDir);
	}

	function profileAuthPath(profileName: string): string {
		return join(profilesDir, profileName, "auth.json");
	}

	async function existingAccountIdsByName(): Promise<Map<string, string>> {
		const result = new Map<string, string>();
		for (const profile of await listProfiles()) {
			result.set(profile.profileName, profile.identity.accountId);
		}
		return result;
	}

	async function readIdentityAt(path: string): Promise<CodexIdentity | null> {
		try {
			return parseCodexIdentity(await readFile(path, "utf8"));
		} catch {
			return null;
		}
	}

	function readActiveIdentitySync(): CodexIdentity | null {
		try {
			return parseCodexIdentity(readFileSync(activeAuthPath, "utf8"));
		} catch {
			return null;
		}
	}

	async function listProfiles(): Promise<CodexProfile[]> {
		ensureStore();
		const activeId = readActiveIdentitySync()?.accountId ?? null;
		const names = (await readdir(profilesDir).catch(() => []))
			.filter((name) => !name.startsWith("."))
			.sort();
		const profiles: CodexProfile[] = [];
		for (const profileName of names) {
			const identity = await readIdentityAt(profileAuthPath(profileName));
			if (!identity) continue;
			profiles.push({
				profileName,
				identity,
				isActive: identity.accountId === activeId,
			});
		}
		return profiles;
	}

	async function importCredential(
		sourceAuthPath: string,
		profileName?: string,
	): Promise<CodexProfile> {
		ensureStore();
		const identity = await readIdentityAt(sourceAuthPath);
		if (!identity) {
			throw new Error("No readable Codex login found.");
		}
		const name =
			profileName ??
			suggestedProfileName(identity, await existingAccountIdsByName());
		assertSafeProfileName(name);
		const destination = profileAuthPath(name);
		await mkdir(join(profilesDir, name), {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
		await copySensitiveFileAtomically(
			sourceAuthPath,
			destination,
			join(profilesDir, name, `.auth-import-${randomId()}.json`),
		);
		return {
			profileName: name,
			identity,
			isActive: identity.accountId === readActiveIdentitySync()?.accountId,
		};
	}

	async function importActive(profileName?: string): Promise<CodexProfile> {
		return importCredential(activeAuthPath, profileName);
	}

	async function activate(profileName: string): Promise<CodexProfile> {
		ensureStore();
		assertSafeProfileName(profileName);
		const source = profileAuthPath(profileName);
		const identity = await readIdentityAt(source);
		if (!identity)
			throw new Error(`Codex profile "${profileName}" does not exist.`);

		await mkdir(join(homeDir, ".codex"), {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
		if (existsSync(activeAuthPath)) {
			const stamp = now().toISOString().replaceAll(":", "-");
			const backupPath = join(backupsDir, `auth-${stamp}-${randomId()}.json`);
			await copySensitiveFileAtomically(
				activeAuthPath,
				backupPath,
				join(backupsDir, `.auth-backup-${randomId()}.json`),
			);
			await pruneBackups();
		}

		const tempPath = join(homeDir, ".codex", `.auth-swap-${randomId()}.json`);
		await copySensitiveFileAtomically(source, activeAuthPath, tempPath);
		return { profileName, identity, isActive: true };
	}

	async function pruneBackups(): Promise<void> {
		const names = (await readdir(backupsDir).catch(() => []))
			.filter((name) => name.startsWith("auth-"))
			.sort();
		for (const name of names.slice(0, -CODEX_BACKUP_RETENTION)) {
			rmSync(join(backupsDir, name), { force: true });
		}
	}

	function readSnapshots(): Record<string, CodexUsageSnapshot> {
		try {
			return JSON.parse(readFileSync(snapshotsPath, "utf8")) as Record<
				string,
				CodexUsageSnapshot
			>;
		} catch {
			return {};
		}
	}

	function getSnapshot(accountId: string): CodexUsageSnapshot | null {
		return readSnapshots()[accountId] ?? null;
	}

	async function putSnapshot(snapshot: CodexUsageSnapshot): Promise<void> {
		ensureStore();
		const snapshots = readSnapshots();
		const existing = snapshots[snapshot.accountId];
		if (existing && existing.capturedAt >= snapshot.capturedAt) return;
		snapshots[snapshot.accountId] = snapshot;
		await writeSensitiveFileAtomically(
			snapshotsPath,
			JSON.stringify(snapshots, null, 2),
			join(storeRoot, `.snapshots-${randomId()}.json`),
		);
	}

	function accountRows(): Promise<ProviderUsageAccount[]> {
		return listProfiles().then((profiles) =>
			profiles.map((profile) => {
				const snapshot = getSnapshot(profile.identity.accountId);
				const windows = snapshot ? projectCachedWindows(snapshot) : [];
				const hasCachedWindows = windows.length > 0;
				return {
					id: `codex:${profile.identity.accountId}`,
					providerId: "codex" as const,
					profileName: profile.profileName,
					accountLabel: profile.identity.email,
					planLabel: snapshot?.planLabel ?? profile.identity.plan,
					isActive: profile.isActive,
					status: hasCachedWindows ? "cached" : "no-data",
					statusMessage: hasCachedWindows
						? "cached"
						: "Use Codex once to record limits",
					windows,
				};
			}),
		);
	}

	async function addViaIsolatedLogin(): Promise<CodexProfile> {
		const shellEnv = await getEnv().catch(
			() => process.env as Record<string, string>,
		);
		const executable = findCodexExecutable(shellEnv);
		if (!executable) throw new Error("Codex CLI not found.");

		ensureStore();
		const sessionHome = join(loginDir, randomId());
		await mkdir(sessionHome, { recursive: true, mode: SUPERSET_HOME_DIR_MODE });
		const configPath = join(sessionHome, "config.toml");
		await writeFile(configPath, 'cli_auth_credentials_store = "file"\n', {
			mode: SUPERSET_SENSITIVE_FILE_MODE,
		});

		try {
			await new Promise<void>((resolve, reject) => {
				const child = spawn(executable, ["login"], {
					cwd: sessionHome,
					env: {
						...shellEnv,
						CODEX_HOME: sessionHome,
						CODEX_SQLITE_HOME: sessionHome,
					},
					stdio: ["ignore", "ignore", "pipe"],
				});
				const timeout = setTimeout(() => {
					child.kill();
					reject(new Error("Codex login timed out."));
				}, CODEX_LOGIN_TIMEOUT_MS);
				child.once("error", (error) => {
					clearTimeout(timeout);
					reject(error);
				});
				child.once("exit", (code) => {
					clearTimeout(timeout);
					if (code === 0) {
						resolve();
					} else {
						reject(new Error("Codex sign-in did not complete."));
					}
				});
			});
			return await importCredential(join(sessionHome, "auth.json"));
		} finally {
			rmSync(sessionHome, { recursive: true, force: true });
		}
	}

	return {
		activeAuthPath,
		activeIdentity: readActiveIdentitySync,
		listProfiles,
		importActive,
		activate,
		getSnapshot,
		putSnapshot,
		accountRows,
		addViaIsolatedLogin,
	};
}

export const codexProfileStore = createCodexProfileStore();
