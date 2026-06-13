import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { SelectTerminalSessionLocation } from "@superset/local-db/schema";
import { terminalSessionLocations } from "@superset/local-db/schema";
import { eq } from "drizzle-orm";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { localDb } from "main/lib/local-db";

export const SESSION_LOCATION_STORE_PATH = join(SUPERSET_HOME_DIR, "local.db");
export const LEGACY_SESSION_LOCATION_LOG_PATH = join(
	SUPERSET_HOME_DIR,
	"session-locations.json",
);

// Kept for compatibility with existing terminal env wiring and tests.
export const SESSION_LOCATION_LOG_PATH = SESSION_LOCATION_STORE_PATH;

export interface SessionLocationEntry {
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	cwd: string;
	command?: string;
	pid: number | null;
	agentId?: string;
	agentSessionId?: string;
	status: "available" | "exited";
	createdAt: number;
	updatedAt: number;
	exitedAt?: number;
	exitReason?: string;
	locationKey: string;
}

export interface SessionLocationStoreAdapter {
	hasAny(): boolean;
	getByPaneId(paneId: string): SelectTerminalSessionLocation | undefined;
	upsert(entry: SessionLocationEntry): void;
	update(
		paneId: string,
		patch: Partial<
			Pick<
				SessionLocationEntry,
				| "agentId"
				| "agentSessionId"
				| "status"
				| "pid"
				| "updatedAt"
				| "exitedAt"
				| "exitReason"
			>
		>,
	): void;
}

interface LegacySessionLocationSource {
	exists(path: string): boolean;
	read(path: string): string;
	archive(path: string): void;
}

type SessionLocationRecord = SelectTerminalSessionLocation;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalIdentityValue(
	value: string | null | undefined,
): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function toOptionalString(value: string | null): string | undefined {
	return value ?? undefined;
}

function readRequiredString(
	value: Record<string, unknown>,
	key: string,
): string | null {
	const candidate = value[key];
	if (typeof candidate !== "string") return null;
	const trimmed = candidate.trim();
	return trimmed ? trimmed : null;
}

function readOptionalStringFromRecord(
	value: Record<string, unknown>,
	key: string,
): string | undefined {
	return normalizeOptionalIdentityValue(
		typeof value[key] === "string" ? value[key] : undefined,
	);
}

function toEntry(record: SessionLocationRecord): SessionLocationEntry {
	return {
		paneId: record.paneId,
		tabId: record.tabId,
		workspaceId: record.workspaceId,
		workspaceName: toOptionalString(record.workspaceName),
		workspacePath: toOptionalString(record.workspacePath),
		rootPath: toOptionalString(record.rootPath),
		cwd: record.cwd,
		command: toOptionalString(record.command),
		pid: record.pid,
		agentId: toOptionalString(record.agentId),
		agentSessionId: toOptionalString(record.agentSessionId),
		status: record.status as SessionLocationEntry["status"],
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		exitedAt: record.exitedAt ?? undefined,
		exitReason: toOptionalString(record.exitReason),
		locationKey: record.locationKey,
	};
}

function createDbStoreAdapter(): SessionLocationStoreAdapter {
	return {
		hasAny() {
			return (
				localDb
					.select({ paneId: terminalSessionLocations.paneId })
					.from(terminalSessionLocations)
					.limit(1)
					.get() !== undefined
			);
		},
		getByPaneId(paneId) {
			return localDb
				.select()
				.from(terminalSessionLocations)
				.where(eq(terminalSessionLocations.paneId, paneId))
				.get();
		},
		upsert(entry) {
			localDb
				.insert(terminalSessionLocations)
				.values({
					paneId: entry.paneId,
					tabId: entry.tabId,
					workspaceId: entry.workspaceId,
					workspaceName: entry.workspaceName ?? null,
					workspacePath: entry.workspacePath ?? null,
					rootPath: entry.rootPath ?? null,
					cwd: entry.cwd,
					command: entry.command ?? null,
					pid: entry.pid,
					agentId: entry.agentId ?? null,
					agentSessionId: entry.agentSessionId ?? null,
					status: entry.status,
					createdAt: entry.createdAt,
					updatedAt: entry.updatedAt,
					exitedAt: entry.exitedAt ?? null,
					exitReason: entry.exitReason ?? null,
					locationKey: entry.locationKey,
				})
				.onConflictDoUpdate({
					target: terminalSessionLocations.paneId,
					set: {
						tabId: entry.tabId,
						workspaceId: entry.workspaceId,
						workspaceName: entry.workspaceName ?? null,
						workspacePath: entry.workspacePath ?? null,
						rootPath: entry.rootPath ?? null,
						cwd: entry.cwd,
						command: entry.command ?? null,
						pid: entry.pid,
						agentId: entry.agentId ?? null,
						agentSessionId: entry.agentSessionId ?? null,
						status: entry.status,
						updatedAt: entry.updatedAt,
						exitedAt: entry.exitedAt ?? null,
						exitReason: entry.exitReason ?? null,
						locationKey: entry.locationKey,
					},
				})
				.run();
		},
		update(paneId, patch) {
			const setValues: Partial<SessionLocationRecord> = {};
			if ("agentId" in patch) {
				setValues.agentId = patch.agentId ?? null;
			}
			if ("agentSessionId" in patch) {
				setValues.agentSessionId = patch.agentSessionId ?? null;
			}
			if ("status" in patch && patch.status !== undefined) {
				setValues.status = patch.status;
			}
			if ("pid" in patch) {
				setValues.pid = patch.pid ?? null;
			}
			if ("updatedAt" in patch && patch.updatedAt !== undefined) {
				setValues.updatedAt = patch.updatedAt;
			}
			if ("exitedAt" in patch) {
				setValues.exitedAt = patch.exitedAt ?? null;
			}
			if ("exitReason" in patch) {
				setValues.exitReason = patch.exitReason ?? null;
			}
			if (Object.keys(setValues).length === 0) {
				return;
			}
			localDb
				.update(terminalSessionLocations)
				.set(setValues)
				.where(eq(terminalSessionLocations.paneId, paneId))
				.run();
		},
	};
}

let storeAdapter = createDbStoreAdapter();
const defaultLegacySessionLocationSource: LegacySessionLocationSource = {
	exists: existsSync,
	read: (path) => readFileSync(path, "utf8"),
	archive: (path) => renameSync(path, `${path}.migrated`),
};
let legacySessionLocationSource = defaultLegacySessionLocationSource;
let legacyImportEnsured = false;

export function setSessionLocationStoreAdapterForTests(
	adapter: SessionLocationStoreAdapter | null,
): void {
	storeAdapter = adapter ?? createDbStoreAdapter();
	legacyImportEnsured = false;
}

export function setLegacySessionLocationSourceForTests(
	source: LegacySessionLocationSource | null,
): void {
	legacySessionLocationSource = source ?? defaultLegacySessionLocationSource;
	legacyImportEnsured = false;
}

function logSessionLocationWarning(message: string, error?: unknown): void {
	if (error === undefined) {
		console.warn(`[session-location-log] ${message}`);
		return;
	}
	console.warn(`[session-location-log] ${message}`, error);
}

function parseLegacySessionLocationEntry(
	value: unknown,
): SessionLocationEntry | null {
	if (!isRecord(value)) return null;

	const paneId = readRequiredString(value, "paneId");
	const tabId = readRequiredString(value, "tabId");
	const workspaceId = readRequiredString(value, "workspaceId");
	const cwd = readRequiredString(value, "cwd");
	if (!paneId || !tabId || !workspaceId || !cwd) {
		return null;
	}

	const locationKey =
		readRequiredString(value, "locationKey") ??
		buildSessionLocationKey({
			workspaceId,
			tabId,
			paneId,
		});
	const createdAt =
		typeof value.createdAt === "number" ? value.createdAt : Date.now();
	const updatedAt =
		typeof value.updatedAt === "number" ? value.updatedAt : createdAt;
	const exitedAt =
		typeof value.exitedAt === "number" ? value.exitedAt : undefined;
	const status = value.status === "exited" ? "exited" : "available";

	return {
		paneId,
		tabId,
		workspaceId,
		workspaceName: readOptionalStringFromRecord(value, "workspaceName"),
		workspacePath: readOptionalStringFromRecord(value, "workspacePath"),
		rootPath: readOptionalStringFromRecord(value, "rootPath"),
		cwd,
		command: readOptionalStringFromRecord(value, "command"),
		pid: typeof value.pid === "number" ? value.pid : null,
		agentId: readOptionalStringFromRecord(value, "agentId"),
		agentSessionId: readOptionalStringFromRecord(value, "agentSessionId"),
		status,
		createdAt,
		updatedAt,
		exitedAt,
		exitReason: readOptionalStringFromRecord(value, "exitReason"),
		locationKey,
	};
}

function parseLegacySessionLocationLog(raw: string): SessionLocationEntry[] {
	const parsed = JSON.parse(raw) as unknown;
	if (!isRecord(parsed)) return [];
	const sessions = parsed.sessions;
	if (!isRecord(sessions)) return [];

	return Object.values(sessions)
		.map((entry) => parseLegacySessionLocationEntry(entry))
		.filter((entry): entry is SessionLocationEntry => entry !== null);
}

function ensureLegacyImportIfNeeded(): void {
	if (legacyImportEnsured) return;
	legacyImportEnsured = true;

	try {
		if (!legacySessionLocationSource.exists(LEGACY_SESSION_LOCATION_LOG_PATH)) {
			return;
		}

		if (storeAdapter.hasAny()) {
			legacySessionLocationSource.archive(LEGACY_SESSION_LOCATION_LOG_PATH);
			return;
		}

		const legacyEntries = parseLegacySessionLocationLog(
			legacySessionLocationSource.read(LEGACY_SESSION_LOCATION_LOG_PATH),
		);
		for (const entry of legacyEntries) {
			storeAdapter.upsert(entry);
		}
		legacySessionLocationSource.archive(LEGACY_SESSION_LOCATION_LOG_PATH);
	} catch (error) {
		logSessionLocationWarning(
			"Failed to migrate legacy session location log",
			error,
		);
	}
}

export function buildSessionLocationKey(params: {
	workspaceId: string;
	tabId: string;
	paneId: string;
}) {
	return `${params.workspaceId}:${params.tabId}:${params.paneId}`;
}

export function upsertSessionLocation(params: {
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	cwd: string;
	command?: string;
	pid: number | null;
}): void {
	try {
		ensureLegacyImportIfNeeded();
		const now = Date.now();
		const previousRecord = storeAdapter.getByPaneId(params.paneId);
		const previous = previousRecord ? toEntry(previousRecord) : undefined;
		const locationKey = buildSessionLocationKey(params);
		const shouldResetAgentIdentity =
			previous?.status !== "available" ||
			previous?.locationKey !== locationKey ||
			previous?.pid !== params.pid;

		storeAdapter.upsert({
			...previous,
			...params,
			agentId: shouldResetAgentIdentity ? undefined : previous?.agentId,
			agentSessionId: shouldResetAgentIdentity
				? undefined
				: previous?.agentSessionId,
			status: "available",
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			exitedAt: undefined,
			exitReason: undefined,
			locationKey,
		});
	} catch (error) {
		logSessionLocationWarning("Failed to upsert session location", error);
	}
}

export function updateSessionLocationAgentIdentity(params: {
	paneId: string;
	agentId?: string | null;
	agentSessionId?: string | null;
}): void {
	try {
		ensureLegacyImportIfNeeded();
		const record = storeAdapter.getByPaneId(params.paneId);
		if (!record) return;

		const entry = toEntry(record);
		const nextAgentId =
			Object.hasOwn(params, "agentId") && params.agentId !== undefined
				? normalizeOptionalIdentityValue(params.agentId)
				: entry.agentId;
		const nextAgentSessionId =
			Object.hasOwn(params, "agentSessionId") &&
			params.agentSessionId !== undefined
				? normalizeOptionalIdentityValue(params.agentSessionId)
				: entry.agentSessionId;

		if (
			nextAgentId === entry.agentId &&
			nextAgentSessionId === entry.agentSessionId
		) {
			return;
		}

		storeAdapter.update(params.paneId, {
			agentId: nextAgentId,
			agentSessionId: nextAgentSessionId,
			updatedAt: Date.now(),
		});
	} catch (error) {
		logSessionLocationWarning(
			"Failed to update session location agent identity",
			error,
		);
	}
}

export function markSessionLocationExited(params: {
	paneId: string;
	exitReason?: string;
}): void {
	try {
		ensureLegacyImportIfNeeded();
		const record = storeAdapter.getByPaneId(params.paneId);
		if (!record) return;
		const now = Date.now();
		storeAdapter.update(params.paneId, {
			status: "exited",
			pid: null,
			updatedAt: now,
			exitedAt: now,
			exitReason: params.exitReason,
		});
	} catch (error) {
		logSessionLocationWarning("Failed to mark session location exited", error);
	}
}

export async function getSessionLocation(
	paneId: string,
): Promise<SessionLocationEntry | null> {
	try {
		ensureLegacyImportIfNeeded();
		const record = storeAdapter.getByPaneId(paneId);
		return record ? toEntry(record) : null;
	} catch (error) {
		logSessionLocationWarning("Failed to read session location", error);
		return null;
	}
}
