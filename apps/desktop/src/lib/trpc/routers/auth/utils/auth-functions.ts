import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import { lock } from "proper-lockfile";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
	organizationIds?: string[];
	organizationIdsRevision?: number;
}

interface LoadedAuth {
	token: string | null;
	expiresAt: string | null;
	organizationIds: string[] | null;
	organizationIdsRevision: number;
}

const TOKEN_FILE_NAME = "auth-token.enc";
const EMPTY_LOADED_AUTH: LoadedAuth = {
	token: null,
	expiresAt: null,
	organizationIds: null,
	organizationIdsRevision: 0,
};

type InspectedTokenStorage =
	| { status: "missing" }
	| { status: "valid"; storedAuth: StoredAuth }
	| { status: "invalid"; reason: string };

function getTokenFile(): string {
	return join(
		process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR,
		TOKEN_FILE_NAME,
	);
}

async function withAuthLock<Result>(
	operation: () => Promise<Result>,
): Promise<Result> {
	const release = await lock(getTokenFile(), {
		realpath: false,
		stale: 10_000,
		retries: { retries: 10, factor: 1, minTimeout: 25, maxTimeout: 250 },
		// Another writer can reclaim a lock this process still holds once our
		// refresh falls behind. proper-lockfile's default handler rethrows from
		// its own timer, where no caller can catch it; the write itself is still
		// atomic, so record the loss and let the operation report its own result.
		onCompromised: (error) =>
			console.warn("[auth] Lost the auth token lock while writing", error),
	});
	try {
		return await operation();
	} finally {
		// Releasing is cleanup. It fails when the lock was already taken from us,
		// which says nothing about whether the write landed, so it must never
		// replace the operation's own success or failure.
		await release().catch((error) =>
			console.warn("[auth] Failed to release the auth token lock", error),
		);
	}
}

function parseStoredAuth(data: Buffer): StoredAuth {
	const parsed: unknown = JSON.parse(decrypt(data));
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Invalid stored auth payload");
	}
	const candidate = parsed as Record<string, unknown>;
	if (
		typeof candidate.token !== "string" ||
		candidate.token.length === 0 ||
		typeof candidate.expiresAt !== "string" ||
		candidate.expiresAt.length === 0 ||
		Number.isNaN(Date.parse(candidate.expiresAt))
	) {
		throw new Error("Invalid stored auth payload");
	}
	return {
		token: candidate.token,
		expiresAt: candidate.expiresAt,
		organizationIds: Array.isArray(candidate.organizationIds)
			? candidate.organizationIds.filter(
					(value): value is string =>
						typeof value === "string" && value.length > 0,
				)
			: undefined,
		organizationIdsRevision:
			typeof candidate.organizationIdsRevision === "number" &&
			Number.isSafeInteger(candidate.organizationIdsRevision) &&
			candidate.organizationIdsRevision >= 0
				? candidate.organizationIdsRevision
				: undefined,
	};
}

function describePathType(stats: Awaited<ReturnType<typeof fs.lstat>>): string {
	if (stats.isDirectory()) return "directory";
	if (stats.isSymbolicLink()) return "symbolic link";
	return "special file";
}

async function inspectTokenStorage(
	tokenFile: string,
): Promise<InspectedTokenStorage> {
	let stats: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stats = await fs.lstat(tokenFile);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { status: "missing" };
		}
		throw error;
	}

	if (!stats.isFile()) {
		return {
			status: "invalid",
			reason: `path is a ${describePathType(stats)}`,
		};
	}

	const encrypted = await fs.readFile(tokenFile);
	try {
		return { status: "valid", storedAuth: parseStoredAuth(encrypted) };
	} catch {
		return {
			status: "invalid",
			reason: "contents could not be decrypted or parsed",
		};
	}
}

async function quarantineInvalidTokenStorage(
	tokenFile: string,
	reason: string,
): Promise<string> {
	const quarantinePath = `${tokenFile}.corrupt-${Date.now()}-${randomUUID()}`;
	await fs.rename(tokenFile, quarantinePath);
	console.warn(
		`[auth] Quarantined invalid auth token storage (${reason}) as ${basename(quarantinePath)}`,
	);
	return quarantinePath;
}

/** Returns the stored auth, quarantining the file if it is unusable. */
async function readStoredAuth(): Promise<StoredAuth | null> {
	const tokenFile = getTokenFile();
	const inspected = await inspectTokenStorage(tokenFile);
	if (inspected.status === "missing") return null;
	if (inspected.status === "invalid") {
		await quarantineInvalidTokenStorage(tokenFile, inspected.reason);
		return null;
	}
	return inspected.storedAuth;
}

async function atomicWriteToken(
	tokenFile: string,
	contents: Buffer,
): Promise<void> {
	const parentDirectory = dirname(tokenFile);
	await fs.mkdir(parentDirectory, {
		recursive: true,
		mode: SUPERSET_HOME_DIR_MODE,
	});

	const temporaryFile = join(
		parentDirectory,
		`.${basename(tokenFile)}.${process.pid}-${randomUUID()}.tmp`,
	);
	let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
	try {
		handle = await fs.open(temporaryFile, "wx", SUPERSET_SENSITIVE_FILE_MODE);
		await handle.writeFile(contents);
		await handle.sync();
		await handle.close();
		handle = null;
		// chmod before the commit rename: the open() mode is masked by umask,
		// and a failure here must leave the previous token intact.
		await fs.chmod(temporaryFile, SUPERSET_SENSITIVE_FILE_MODE);
		await fs.rename(temporaryFile, tokenFile);
	} catch (error) {
		await handle?.close().catch(() => {});
		await fs.unlink(temporaryFile).catch(() => {});
		throw error;
	}
}

async function writeStoredAuth(storedAuth: StoredAuth): Promise<void> {
	await atomicWriteToken(getTokenFile(), encrypt(JSON.stringify(storedAuth)));
}

export const stateStore = new Map<string, number>();
let authWriteQueue: Promise<unknown> = Promise.resolve();

function serializeAuthWrite<Result>(
	operation: () => Promise<Result>,
): Promise<Result> {
	const lockedOperation = () => withAuthLock(operation);
	const nextWrite = authWriteQueue.then(lockedOperation, lockedOperation);
	authWriteQueue = nextWrite.then(
		() => undefined,
		() => undefined,
	);
	return nextWrite;
}

/**
 * Event emitter for auth-related events.
 * Used by tRPC subscription to notify renderer of token changes.
 *
 * Events:
 * - "token-saved": { token, expiresAt } - New token saved (OAuth callback)
 * - "organization-ids-saved": { token, organizationIds } - Membership cached
 * - "token-cleared": (no data) - Token deleted (sign-out)
 */
export const authEvents = new EventEmitter();

/**
 * Load token from encrypted disk storage.
 */
export async function loadToken(): Promise<LoadedAuth> {
	const tokenFile = getTokenFile();
	try {
		const storedAuth = await readStoredAuth();
		if (!storedAuth) return EMPTY_LOADED_AUTH;

		await fs
			.chmod(tokenFile, SUPERSET_SENSITIVE_FILE_MODE)
			.catch((error) =>
				console.warn("[auth] Failed to repair auth token permissions", error),
			);
		return {
			token: storedAuth.token,
			expiresAt: storedAuth.expiresAt,
			organizationIds: storedAuth.organizationIds ?? null,
			organizationIdsRevision: storedAuth.organizationIdsRevision ?? 0,
		};
	} catch (error) {
		console.error("[auth] Failed to inspect auth token storage", error);
		return EMPTY_LOADED_AUTH;
	}
}

/**
 * Persist token to encrypted disk storage and notify subscribers.
 */
export async function saveToken({
	token,
	expiresAt,
}: {
	token: string;
	expiresAt: string;
}): Promise<void> {
	await serializeAuthWrite(async () => {
		// Moves unusable storage aside first: renaming onto a directory fails.
		await readStoredAuth();
		await writeStoredAuth({ token, expiresAt });
		authEvents.emit("token-saved", { token, expiresAt });
	});
}

export async function clearToken(): Promise<void> {
	await serializeAuthWrite(async () => {
		const tokenFile = getTokenFile();
		const inspected = await inspectTokenStorage(tokenFile);
		if (inspected.status === "valid") {
			await fs.rm(tokenFile, { force: true });
		} else if (inspected.status === "invalid") {
			await quarantineInvalidTokenStorage(tokenFile, inspected.reason);
		}
		authEvents.emit("token-cleared");
	});
}

/** Cache the last membership confirmed by the authenticated session. */
export async function saveOrganizationIds({
	token,
	organizationIds,
	expectedRevision,
}: {
	token: string;
	organizationIds: string[];
	expectedRevision: number;
}): Promise<
	| { status: "saved"; revision: number }
	| { status: "conflict"; revision: number }
	| { status: "token-mismatch"; revision: number }
> {
	return await serializeAuthWrite(async () => {
		const storedAuth = await readStoredAuth();
		if (!storedAuth || storedAuth.token !== token) {
			return { status: "token-mismatch" as const, revision: 0 };
		}

		const currentRevision = storedAuth.organizationIdsRevision ?? 0;
		if (expectedRevision !== currentRevision) {
			return { status: "conflict" as const, revision: currentRevision };
		}
		if (currentRevision === Number.MAX_SAFE_INTEGER) {
			throw new Error("Organization membership revision exhausted");
		}

		const normalizedIds = [...new Set(organizationIds)].sort();
		const revision = currentRevision + 1;
		await writeStoredAuth({
			token: storedAuth.token,
			expiresAt: storedAuth.expiresAt,
			organizationIds: normalizedIds,
			organizationIdsRevision: revision,
		});
		authEvents.emit("organization-ids-saved", {
			token: storedAuth.token,
			organizationIds: normalizedIds,
		});
		return { status: "saved" as const, revision };
	});
}

/**
 * Handle OAuth callback from deep link.
 * Validates CSRF state and saves token.
 */
export async function handleAuthCallback(params: {
	token: string;
	expiresAt: string;
	state: string;
}): Promise<{ success: boolean; error?: string }> {
	const stateIssuedAt = stateStore.get(params.state);
	if (stateIssuedAt === undefined) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	try {
		await saveToken({ token: params.token, expiresAt: params.expiresAt });
	} catch (error) {
		// Put the state back so the callback can be retried after a write failure.
		stateStore.set(params.state, stateIssuedAt);
		console.error("[auth] Failed to persist desktop auth token", error);
		return {
			success: false,
			error: `Superset could not save your sign-in to ${getTokenFile()}. Your existing data was left untouched. Check the path and try again.`,
		};
	}

	return { success: true };
}

export type ParsedAuthDeepLink =
	| { type: "not-auth" }
	| { type: "malformed" }
	| {
			type: "valid";
			params: { token: string; expiresAt: string; state: string };
	  };

/**
 * Parse and validate auth deep link URL.
 *
 * Classifies by host/path before validating fields so a malformed auth
 * callback (which may still carry a token) is never treated as a plain
 * deep link and logged or navigated with.
 */
export function parseAuthDeepLink(url: string): ParsedAuthDeepLink {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return { type: "not-auth" };
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") {
			return { type: "not-auth" };
		}

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return { type: "malformed" };
		return { type: "valid", params: { token, expiresAt, state } };
	} catch {
		return { type: "not-auth" };
	}
}
