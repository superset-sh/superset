import fs from "node:fs";
import path from "node:path";
import { app, session } from "electron";

const PARTITION = "persist:superset";
const CURRENT_FILE = "current.json";
const SESSION_PREFIX = "session-";
const SESSION_SUFFIX = ".json";
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_RETAINED_SESSIONS = 3;

let started = false;

function logsDir(): string {
	const dir = path.join(app.getPath("userData"), "network-logs");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function archivePreviousSession(): void {
	const dir = logsDir();
	const currentPath = path.join(dir, CURRENT_FILE);
	if (!fs.existsSync(currentPath)) return;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const archivedPath = path.join(
		dir,
		`${SESSION_PREFIX}${stamp}${SESSION_SUFFIX}`,
	);
	fs.renameSync(currentPath, archivedPath);
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

function pruneOldSessions(): void {
	const dir = logsDir();
	const files = fs
		.readdirSync(dir)
		.filter(
			(name) =>
				name.startsWith(SESSION_PREFIX) && name.endsWith(SESSION_SUFFIX),
		)
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

export async function startNetworkLogger(): Promise<void> {
	if (started) return;
	archivePreviousSession();
	pruneOldSessions();
	const logPath = path.join(logsDir(), CURRENT_FILE);
	await session.fromPartition(PARTITION).netLog.startLogging(logPath, {
		captureMode: "includeSensitive",
		maxFileSize: MAX_FILE_BYTES,
	});
	started = true;
	console.log("[network-logger] recording to", logPath);
}

export async function stopNetworkLogger(): Promise<void> {
	if (!started) return;
	try {
		await session.fromPartition(PARTITION).netLog.stopLogging();
		started = false;
	} catch (error) {
		console.warn("[network-logger] stopLogging failed:", error);
	}
}
