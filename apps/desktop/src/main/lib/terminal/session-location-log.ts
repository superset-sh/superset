import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";

export const SESSION_LOCATION_LOG_PATH = join(
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

interface SessionLocationLog {
	version: 1;
	updatedAt: number;
	path: string;
	sessions: Record<string, SessionLocationEntry>;
	locations: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
	return Object.hasOwn(value, key);
}

function normalizeOptionalIdentityValue(
	value: string | null | undefined,
): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function buildSessionLocationKey(params: {
	workspaceId: string;
	tabId: string;
	paneId: string;
}) {
	return `${params.workspaceId}:${params.tabId}:${params.paneId}`;
}

function emptyLog(): SessionLocationLog {
	return {
		version: 1,
		updatedAt: Date.now(),
		path: SESSION_LOCATION_LOG_PATH,
		sessions: {},
		locations: {},
	};
}

async function readLog(): Promise<SessionLocationLog> {
	try {
		const raw = await fs.readFile(SESSION_LOCATION_LOG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<SessionLocationLog>;
		return {
			version: 1,
			updatedAt:
				typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
			path: SESSION_LOCATION_LOG_PATH,
			sessions: isRecord(parsed.sessions)
				? (parsed.sessions as Record<string, SessionLocationEntry>)
				: {},
			locations: isRecord(parsed.locations)
				? (parsed.locations as Record<string, string>)
				: {},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn(
				"[session-location-log] Failed to read session location log:",
				error,
			);
		}
		return emptyLog();
	}
}

async function writeLog(log: SessionLocationLog): Promise<void> {
	try {
		await fs.mkdir(dirname(SESSION_LOCATION_LOG_PATH), { recursive: true });
		log.updatedAt = Date.now();
		log.path = SESSION_LOCATION_LOG_PATH;
		const tmpPath = `${SESSION_LOCATION_LOG_PATH}.tmp`;
		await fs.writeFile(tmpPath, `${JSON.stringify(log, null, 2)}\n`, {
			mode: SUPERSET_SENSITIVE_FILE_MODE,
		});
		await fs.rename(tmpPath, SESSION_LOCATION_LOG_PATH);
		await fs.chmod(SESSION_LOCATION_LOG_PATH, SUPERSET_SENSITIVE_FILE_MODE);
	} catch (error) {
		console.warn(
			"[session-location-log] Failed to write session location log:",
			error,
		);
	}
}

let operationQueue = Promise.resolve();

function enqueueUpdate(update: (log: SessionLocationLog) => void): void {
	operationQueue = operationQueue
		.then(async () => {
			const log = await readLog();
			update(log);
			await writeLog(log);
		})
		.catch((error) => {
			console.warn("[session-location-log] Failed to update log:", error);
		});
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
	enqueueUpdate((log) => {
		const now = Date.now();
		const previous = log.sessions[params.paneId];
		const locationKey = buildSessionLocationKey(params);
		const shouldResetAgentIdentity =
			previous?.status !== "available" ||
			previous?.locationKey !== locationKey ||
			previous?.pid !== params.pid;
		if (previous?.locationKey && previous.locationKey !== locationKey) {
			delete log.locations[previous.locationKey];
		}
		log.sessions[params.paneId] = {
			...previous,
			...params,
			agentId: shouldResetAgentIdentity ? undefined : previous?.agentId,
			agentSessionId: shouldResetAgentIdentity
				? undefined
				: previous?.agentSessionId,
			status: "available",
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			locationKey,
			exitedAt: undefined,
			exitReason: undefined,
		};
		log.locations[locationKey] = params.paneId;
	});
}

export function updateSessionLocationAgentIdentity(params: {
	paneId: string;
	agentId?: string;
	agentSessionId?: string;
}): void {
	enqueueUpdate((log) => {
		const entry = log.sessions[params.paneId];
		if (!entry) return;

		const nextAgentId = hasOwn(params, "agentId")
			? normalizeOptionalIdentityValue(params.agentId)
			: entry.agentId;
		const nextAgentSessionId = hasOwn(params, "agentSessionId")
			? normalizeOptionalIdentityValue(params.agentSessionId)
			: entry.agentSessionId;

		if (
			nextAgentId === entry.agentId &&
			nextAgentSessionId === entry.agentSessionId
		) {
			return;
		}

		log.sessions[params.paneId] = {
			...entry,
			agentId: nextAgentId,
			agentSessionId: nextAgentSessionId,
			updatedAt: Date.now(),
		};
	});
}

export function markSessionLocationExited(params: {
	paneId: string;
	exitReason?: string;
}): void {
	enqueueUpdate((log) => {
		const entry = log.sessions[params.paneId];
		if (!entry) return;
		const now = Date.now();
		log.sessions[params.paneId] = {
			...entry,
			status: "exited",
			pid: null,
			updatedAt: now,
			exitedAt: now,
			exitReason: params.exitReason,
		};
	});
}

export async function getSessionLocation(
	paneId: string,
): Promise<SessionLocationEntry | null> {
	await operationQueue.catch(() => {});
	const log = await readLog();
	return log.sessions[paneId] ?? null;
}
