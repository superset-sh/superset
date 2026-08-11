import fs from "node:fs";
import path from "node:path";
import { app, session } from "electron";

const PARTITION = "persist:superset";
const CURRENT_FILE = "current.json";
const SESSION_PREFIX = "session-";
const SESSION_SUFFIX = ".json";
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_RETAINED_SESSIONS = 3;

/**
 * Network logging is opt-in: a netLog capture records request/response metadata
 * for every site loaded in the shared `persist:superset` partition, so it must
 * never run without the user asking for it. Enable it for a single run with
 * `SUPERSET_ENABLE_NETWORK_LOG=1` or `--enable-network-log`.
 */
const ENABLE_ENV_VAR = "SUPERSET_ENABLE_NETWORK_LOG";
const ENABLE_FLAG = "--enable-network-log";

/**
 * `includeSensitive` writes `Authorization` and `Cookie` headers to disk in
 * plaintext. `default` keeps the request/response metadata that makes these
 * logs useful while Chromium strips credentials for us.
 */
const CAPTURE_MODE = "default" as const;

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

type NetLog = {
	startLogging(
		logPath: string,
		options: { captureMode: typeof CAPTURE_MODE; maxFileSize: number },
	): Promise<void>;
	stopLogging(): Promise<void>;
};

/** Overridable seams so tests never need a live Electron session. */
type StartContext = {
	userDataDir?: string;
	netLog?: NetLog;
	argv?: string[];
};

let activeNetLog: NetLog | null = null;

export function isNetworkLoggingEnabled(
	argv: string[] = process.argv,
): boolean {
	const flag = process.env[ENABLE_ENV_VAR];
	if (flag === "1" || flag === "true") return true;
	return argv.includes(ENABLE_FLAG);
}

function logsDir(userDataDir: string): string {
	const dir = path.join(userDataDir, "network-logs");
	fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
	restrictPermissions(dir, DIR_MODE);
	return dir;
}

function restrictPermissions(target: string, mode: number): void {
	try {
		fs.chmodSync(target, mode);
	} catch {
		// Best-effort: not every filesystem supports POSIX modes
	}
}

function sessionLogNames(dir: string): string[] {
	return fs
		.readdirSync(dir)
		.filter(
			(name) =>
				name.startsWith(SESSION_PREFIX) && name.endsWith(SESSION_SUFFIX),
		);
}

function archivePreviousSession(userDataDir: string): void {
	const dir = logsDir(userDataDir);
	const currentPath = path.join(dir, CURRENT_FILE);
	if (!fs.existsSync(currentPath)) return;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const archivedPath = path.join(
		dir,
		`${SESSION_PREFIX}${stamp}${SESSION_SUFFIX}`,
	);
	fs.renameSync(currentPath, archivedPath);
	restrictPermissions(archivedPath, FILE_MODE);
	finalizeIfNeeded(archivedPath);
}

const EVENT_ARRAY_MARKER = Buffer.from('"events":[');
const EVENT_BOUNDARY = Buffer.from("},\n");
const CLOSING = Buffer.from("\n]}");

function finalizeIfNeeded(filePath: string): void {
	const stats = fs.statSync(filePath);
	if (stats.size < 4) return;
	const tailWindow = Math.min(stats.size, 8 * 1024);
	const buffer = Buffer.alloc(tailWindow);
	const fd = fs.openSync(filePath, "r+");
	try {
		fs.readSync(fd, buffer, 0, tailWindow, stats.size - tailWindow);
		if (buffer.toString("utf8").trimEnd().endsWith("]}")) return;
		const lastBoundary = buffer.lastIndexOf(EVENT_BOUNDARY);
		if (lastBoundary === -1) return;
		const eventsMarker = buffer.indexOf(EVENT_ARRAY_MARKER);
		if (eventsMarker !== -1 && lastBoundary < eventsMarker) return;
		const truncateAt = stats.size - tailWindow + lastBoundary + 1;
		fs.ftruncateSync(fd, truncateAt);
		fs.writeSync(fd, CLOSING, 0, CLOSING.length, truncateAt);
	} finally {
		fs.closeSync(fd);
	}
}

function pruneOldSessions(userDataDir: string): void {
	const dir = logsDir(userDataDir);
	const files = sessionLogNames(dir)
		.map((name) => ({
			name,
			mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
		}))
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
	for (const stale of files.slice(MAX_RETAINED_SESSIONS)) {
		try {
			fs.unlinkSync(path.join(dir, stale.name));
		} catch {
			// Best-effort
		}
	}
}

/**
 * Deletes every log this module has ever written. Releases 1.9.4-1.15.0 recorded
 * with `includeSensitive`, so an upgrading install can still be holding live
 * bearer tokens and session cookies on disk; those are purged on next launch.
 */
export function purgeNetworkLogs(
	userDataDir: string = app.getPath("userData"),
): void {
	const dir = path.join(userDataDir, "network-logs");
	if (!fs.existsSync(dir)) return;
	for (const name of [CURRENT_FILE, ...sessionLogNames(dir)]) {
		try {
			fs.rmSync(path.join(dir, name), { force: true });
		} catch {
			// Best-effort
		}
	}
}

export async function startNetworkLogger(
	context: StartContext = {},
): Promise<void> {
	if (activeNetLog) return;
	const userDataDir = context.userDataDir ?? app.getPath("userData");
	if (!isNetworkLoggingEnabled(context.argv)) {
		purgeNetworkLogs(userDataDir);
		return;
	}
	archivePreviousSession(userDataDir);
	pruneOldSessions(userDataDir);
	const logPath = path.join(logsDir(userDataDir), CURRENT_FILE);
	// Create the file ourselves so Chromium writes into an owner-only file
	// instead of one created with the default umask.
	fs.writeFileSync(logPath, "", { mode: FILE_MODE });
	restrictPermissions(logPath, FILE_MODE);
	const netLog = context.netLog ?? session.fromPartition(PARTITION).netLog;
	await netLog.startLogging(logPath, {
		captureMode: CAPTURE_MODE,
		maxFileSize: MAX_FILE_BYTES,
	});
	activeNetLog = netLog;
	console.log("[network-logger] recording to", logPath);
}

export async function stopNetworkLogger(): Promise<void> {
	const netLog = activeNetLog;
	if (!netLog) return;
	try {
		await netLog.stopLogging();
		activeNetLog = null;
	} catch (error) {
		console.warn("[network-logger] stopLogging failed:", error);
	}
}
