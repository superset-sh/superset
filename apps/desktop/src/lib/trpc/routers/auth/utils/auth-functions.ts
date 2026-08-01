import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { lock } from "proper-lockfile";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
	organizationIds?: string[];
	organizationIdsRevision?: number;
}

function getTokenFile(): string {
	return join(
		process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR,
		"auth-token.enc",
	);
}

async function withAuthLock<Result>(
	operation: () => Promise<Result>,
): Promise<Result> {
	const release = await lock(getTokenFile(), {
		realpath: false,
		stale: 10_000,
		retries: { retries: 10, factor: 1, minTimeout: 25, maxTimeout: 250 },
	});
	try {
		return await operation();
	} finally {
		await release();
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
		typeof candidate.expiresAt !== "string"
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

async function readStoredAuth(): Promise<StoredAuth | null> {
	try {
		return parseStoredAuth(await fs.readFile(getTokenFile()));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function writeStoredAuth(storedAuth: StoredAuth): Promise<void> {
	const tokenFile = getTokenFile();
	const temporaryFile = `${tokenFile}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporaryFile, encrypt(JSON.stringify(storedAuth)), {
			mode: 0o600,
		});
		await fs.rename(temporaryFile, tokenFile);
	} finally {
		await fs.rm(temporaryFile, { force: true });
	}
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
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
	organizationIds: string[] | null;
	organizationIdsRevision: number;
}> {
	try {
		const parsed = await readStoredAuth();
		if (!parsed) {
			return {
				token: null,
				expiresAt: null,
				organizationIds: null,
				organizationIdsRevision: 0,
			};
		}
		return {
			token: parsed.token,
			expiresAt: parsed.expiresAt,
			organizationIds: parsed.organizationIds ?? null,
			organizationIdsRevision: parsed.organizationIdsRevision ?? 0,
		};
	} catch {
		return {
			token: null,
			expiresAt: null,
			organizationIds: null,
			organizationIdsRevision: 0,
		};
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
		const storedAuth: StoredAuth = { token, expiresAt };
		await writeStoredAuth(storedAuth);
		authEvents.emit("token-saved", { token, expiresAt });
	});
}

export async function clearToken(): Promise<void> {
	await serializeAuthWrite(async () => {
		try {
			await fs.unlink(getTokenFile());
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
	if (!stateStore.has(params.state)) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	await saveToken({ token: params.token, expiresAt: params.expiresAt });

	return { success: true };
}

/**
 * Parse and validate auth deep link URL.
 */
export function parseAuthDeepLink(
	url: string,
): { token: string; expiresAt: string; state: string } | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return null;
		return { token, expiresAt, state };
	} catch {
		return null;
	}
}
