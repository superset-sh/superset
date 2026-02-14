import { createHash } from "node:crypto";
import {
	chmodSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import https from "node:https";
import { dirname, join } from "node:path";
import { EventEmitter } from "node:events";
import { app } from "electron";
import {
	CLAUDE_BINARY_STATUS,
	type ClaudeBinaryStatus,
} from "shared/claude-binary";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pinned version — bump this when upgrading the bundled Claude binary. */
const PINNED_CLAUDE_VERSION = "2.1.17";

const DIST_BASE =
	"https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

const PLATFORMS: Record<string, { dir: string; binary: string }> = {
	"darwin-arm64": { dir: "darwin-arm64", binary: "claude" },
	"darwin-x64": { dir: "darwin-x64", binary: "claude" },
	"linux-arm64": { dir: "linux-arm64", binary: "claude" },
	"linux-x64": { dir: "linux-x64", binary: "claude" },
	"win32-x64": { dir: "win32-x64", binary: "claude.exe" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeBinaryStatusEvent {
	status: ClaudeBinaryStatus;
	progress?: number; // 0–100
	error?: string;
}

interface PlatformManifest {
	checksum: string;
	size: number;
}

interface Manifest {
	version: string;
	platforms: Record<string, PlatformManifest>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const claudeBinaryEmitter = new EventEmitter();

let currentStatus: ClaudeBinaryStatus = CLAUDE_BINARY_STATUS.IDLE;
let currentProgress: number | undefined;
let currentError: string | undefined;

/** Shared in-flight download promise — concurrent callers share one download. */
let inflightPromise: Promise<string> | null = null;

function emitStatus(
	status: ClaudeBinaryStatus,
	progress?: number,
	error?: string,
): void {
	currentStatus = status;
	currentProgress = progress;
	currentError = error;
	claudeBinaryEmitter.emit("status-changed", {
		status,
		progress,
		error,
	} satisfies ClaudeBinaryStatusEvent);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getBinaryStatus(): ClaudeBinaryStatusEvent {
	return {
		status: currentStatus,
		progress: currentProgress,
		error: currentError,
	};
}

export function isClaudeBinaryReady(): boolean {
	return currentStatus === CLAUDE_BINARY_STATUS.READY;
}

/**
 * Return the path to a ready-to-use Claude binary.
 *
 * - In dev mode (`!app.isPackaged`), returns the local `resources/bin/<platform>/claude`.
 * - In production, downloads to `~/.superset/claude-bin/<version>/<platform>/claude`
 *   on first call, then returns the cached path.
 * - Concurrent callers share a single in-flight download.
 */
export async function ensureClaudeBinary(): Promise<string> {
	// Dev mode — use the local dev binary
	if (!app.isPackaged) {
		const platform = process.platform;
		const arch = process.arch;
		return join(
			app.getAppPath(),
			"resources",
			"bin",
			`${platform}-${arch}`,
			"claude",
		);
	}

	const binaryPath = getProductionBinaryPath();

	// Already downloaded and on disk
	if (existsSync(binaryPath)) {
		emitStatus(CLAUDE_BINARY_STATUS.READY);
		return binaryPath;
	}

	// Join an in-flight download if one is already running
	if (inflightPromise) {
		return inflightPromise;
	}

	inflightPromise = downloadBinary(binaryPath)
		.then((path) => {
			inflightPromise = null;
			return path;
		})
		.catch((err) => {
			inflightPromise = null;
			throw err;
		});

	return inflightPromise;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPlatformKey(): string {
	return `${process.platform}-${process.arch}`;
}

function getProductionBinaryPath(): string {
	const platformKey = getPlatformKey();
	const platform = PLATFORMS[platformKey];
	const binary = platform?.binary ?? "claude";
	const homeDir = app.getPath("home");
	return join(
		homeDir,
		".superset",
		"claude-bin",
		PINNED_CLAUDE_VERSION,
		platformKey,
		binary,
	);
}

async function downloadBinary(destPath: string): Promise<string> {
	const platformKey = getPlatformKey();
	const platform = PLATFORMS[platformKey];
	if (!platform) {
		const msg = `Unsupported platform: ${platformKey}`;
		emitStatus(CLAUDE_BINARY_STATUS.ERROR, undefined, msg);
		throw new Error(msg);
	}

	emitStatus(CLAUDE_BINARY_STATUS.DOWNLOADING, 0);
	console.log(
		`[claude-binary] Downloading Claude ${PINNED_CLAUDE_VERSION} for ${platformKey}…`,
	);

	try {
		// 1. Fetch manifest
		const manifestUrl = `${DIST_BASE}/${PINNED_CLAUDE_VERSION}/manifest.json`;
		const manifest = await fetchJson<Manifest>(manifestUrl);

		const platformManifest = manifest.platforms[platform.dir];
		if (!platformManifest) {
			throw new Error(
				`No manifest entry for ${platform.dir} in version ${PINNED_CLAUDE_VERSION}`,
			);
		}

		const downloadUrl = `${DIST_BASE}/${PINNED_CLAUDE_VERSION}/${platform.dir}/${platform.binary}`;

		// 2. Ensure target directory exists
		mkdirSync(dirname(destPath), { recursive: true });

		// 3. Download with progress
		await downloadFile({
			url: downloadUrl,
			destPath,
			expectedSize: platformManifest.size,
		});

		// 4. Verify checksum
		const actualHash = await calculateSha256(destPath);
		if (actualHash !== platformManifest.checksum) {
			// Remove corrupted file so next attempt re-downloads
			rmSync(destPath, { force: true });
			throw new Error(
				`Checksum mismatch — expected ${platformManifest.checksum.substring(0, 16)}…, got ${actualHash.substring(0, 16)}…`,
			);
		}

		// 5. Make executable (Unix)
		if (process.platform !== "win32") {
			chmodSync(destPath, 0o755);
		}

		console.log(`[claude-binary] Ready at ${destPath}`);
		emitStatus(CLAUDE_BINARY_STATUS.READY);
		return destPath;
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Unknown download error";
		console.error(`[claude-binary] Download failed: ${message}`);
		emitStatus(CLAUDE_BINARY_STATUS.ERROR, undefined, message);
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Network helpers (adapted from scripts/download-claude-binary.ts)
// ---------------------------------------------------------------------------

function fetchJson<T>(url: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const request = (requestUrl: string) => {
			https
				.get(requestUrl, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						const location = res.headers.location;
						if (location) {
							return request(location);
						}
						return reject(new Error("Redirect without location"));
					}
					if (res.statusCode !== 200) {
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					let data = "";
					res.on("data", (chunk) => {
						data += chunk;
					});
					res.on("end", () => resolve(JSON.parse(data) as T));
					res.on("error", reject);
				})
				.on("error", reject);
		};
		request(url);
	});
}

function downloadFile({
	url,
	destPath,
	expectedSize,
}: {
	url: string;
	destPath: string;
	expectedSize: number;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const parentDir = dirname(destPath);
		if (!existsSync(parentDir)) {
			mkdirSync(parentDir, { recursive: true });
		}

		const file = createWriteStream(destPath);

		const request = (requestUrl: string) => {
			https
				.get(requestUrl, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						const location = res.headers.location;
						if (location) {
							return request(location);
						}
						return reject(new Error("Redirect without location"));
					}

					if (res.statusCode !== 200) {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						return reject(new Error(`HTTP ${res.statusCode}`));
					}

					const totalSize =
						Number.parseInt(
							res.headers["content-length"] || "0",
							10,
						) || expectedSize;
					let downloaded = 0;
					let lastEmittedPercent = 0;

					res.on("data", (chunk: Buffer) => {
						downloaded += chunk.length;
						if (totalSize > 0) {
							const percent = Math.floor(
								(downloaded / totalSize) * 100,
							);
							// Emit every 5% to avoid flooding
							if (percent >= lastEmittedPercent + 5) {
								lastEmittedPercent = percent;
								emitStatus(
									CLAUDE_BINARY_STATUS.DOWNLOADING,
									percent,
								);
							}
						}
					});

					res.pipe(file);

					file.on("finish", () => {
						file.close();
						resolve();
					});

					res.on("error", (err) => {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						reject(err);
					});
				})
				.on("error", (err) => {
					file.close();
					if (existsSync(destPath)) unlinkSync(destPath);
					reject(err);
				});
		};

		request(url);
	});
}

function calculateSha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}
