import { existsSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { terminalSessionLocations } from "@superset/host-service/db";
import { eq } from "drizzle-orm";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";

export const LEGACY_SESSION_LOCATION_LOG_PATH = join(
	SUPERSET_HOME_DIR,
	"session-locations.json",
);

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

type SessionLocationPatch = Partial<
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
>;

export interface SessionLocationStoreAdapter {
	isAvailable(): boolean;
	getByPaneId(paneId: string): SessionLocationEntry | undefined;
	upsert(entry: SessionLocationEntry): void;
	update(paneId: string, patch: SessionLocationPatch): void;
}

type TerminalSessionLocationRow = typeof terminalSessionLocations.$inferSelect;
type HostDbAccess = {
	getActiveHostDb: () => ReturnType<
		typeof import("main/lib/host-db").getActiveHostDb
	>;
	getActiveHostDbPath: () => ReturnType<
		typeof import("main/lib/host-db").getActiveHostDbPath
	>;
};

interface LegacySessionLocationSource {
	exists(path: string): boolean;
	read(path: string): string;
	archive(path: string): void;
}

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

function toNullableString(value: string | undefined): string | null {
	return value ?? null;
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

function toEntry(record: TerminalSessionLocationRow): SessionLocationEntry {
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
		isAvailable() {
			return getHostDbAccess().getActiveHostDb() !== null;
		},
		getByPaneId(paneId) {
			const db = getHostDbAccess().getActiveHostDb();
			if (!db) return undefined;
			const record = db
				.select()
				.from(terminalSessionLocations)
				.where(eq(terminalSessionLocations.paneId, paneId))
				.get();
			return record ? toEntry(record) : undefined;
		},
		upsert(entry) {
			const db = getHostDbAccess().getActiveHostDb();
			if (!db) return;
			db.insert(terminalSessionLocations)
				.values({
					paneId: entry.paneId,
					tabId: entry.tabId,
					workspaceId: entry.workspaceId,
					workspaceName: toNullableString(entry.workspaceName),
					workspacePath: toNullableString(entry.workspacePath),
					rootPath: toNullableString(entry.rootPath),
					cwd: entry.cwd,
					command: toNullableString(entry.command),
					pid: entry.pid,
					agentId: toNullableString(entry.agentId),
					agentSessionId: toNullableString(entry.agentSessionId),
					status: entry.status,
					createdAt: entry.createdAt,
					updatedAt: entry.updatedAt,
					exitedAt: entry.exitedAt ?? null,
					exitReason: toNullableString(entry.exitReason),
					locationKey: entry.locationKey,
				})
				.onConflictDoUpdate({
					target: terminalSessionLocations.paneId,
					set: {
						tabId: entry.tabId,
						workspaceId: entry.workspaceId,
						workspaceName: toNullableString(entry.workspaceName),
						workspacePath: toNullableString(entry.workspacePath),
						rootPath: toNullableString(entry.rootPath),
						cwd: entry.cwd,
						command: toNullableString(entry.command),
						pid: entry.pid,
						agentId: toNullableString(entry.agentId),
						agentSessionId: toNullableString(entry.agentSessionId),
						status: entry.status,
						updatedAt: entry.updatedAt,
						exitedAt: entry.exitedAt ?? null,
						exitReason: toNullableString(entry.exitReason),
						locationKey: entry.locationKey,
					},
				})
				.run();
		},
		update(paneId, patch) {
			const db = getHostDbAccess().getActiveHostDb();
			if (!db) return;
			const setValues: Partial<TerminalSessionLocationRow> = {};
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
			db.update(terminalSessionLocations)
				.set(setValues)
				.where(eq(terminalSessionLocations.paneId, paneId))
				.run();
		},
	};
}

let storeAdapter = createDbStoreAdapter();
const require = createRequire(import.meta.url);
const defaultLegacySessionLocationSource: LegacySessionLocationSource = {
	exists: existsSync,
	read: (path) => readFileSync(path, "utf8"),
	archive: (path) => renameSync(path, `${path}.migrated`),
};
let legacySessionLocationSource = defaultLegacySessionLocationSource;
let hostDbAccessOverride: HostDbAccess | null = null;
let legacyImportEnsured = false;

function getHostDbAccess(): HostDbAccess {
	return hostDbAccessOverride ?? (require("main/lib/host-db") as HostDbAccess);
}

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

export function setHostDbAccessForTests(access: HostDbAccess | null): void {
	hostDbAccessOverride = access;
}

export function getSessionLocationStorePath(): string | null {
	return getHostDbAccess().getActiveHostDbPath();
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
	if (legacyImportEnsured || !storeAdapter.isAvailable()) return;

	try {
		if (!legacySessionLocationSource.exists(LEGACY_SESSION_LOCATION_LOG_PATH)) {
			legacyImportEnsured = true;
			return;
		}

		const legacyEntries = parseLegacySessionLocationLog(
			legacySessionLocationSource.read(LEGACY_SESSION_LOCATION_LOG_PATH),
		);
		for (const entry of legacyEntries) {
			if (storeAdapter.getByPaneId(entry.paneId)) {
				continue;
			}
			storeAdapter.upsert(entry);
		}
		legacySessionLocationSource.archive(LEGACY_SESSION_LOCATION_LOG_PATH);
		legacyImportEnsured = true;
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
		const previous = storeAdapter.getByPaneId(params.paneId);
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
		const entry = storeAdapter.getByPaneId(params.paneId);
		if (!entry) return;

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
		const entry = storeAdapter.getByPaneId(params.paneId);
		if (!entry) return;
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
		return storeAdapter.getByPaneId(paneId) ?? null;
	} catch (error) {
		logSessionLocationWarning("Failed to read session location", error);
		return null;
	}
}
