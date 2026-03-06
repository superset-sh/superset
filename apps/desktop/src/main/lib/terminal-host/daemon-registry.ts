import {
	chmodSync,
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";

export type DaemonState = "preferred" | "draining" | "retired";

export interface DaemonRegistryEntry {
	generationId: string;
	socketPath: string;
	pid: number;
	appVersion: string;
	state: DaemonState;
	createdAt: string;
	updatedAt: string;
	lastSeenAt: string;
}

interface DaemonRegistryFile {
	version: 1;
	daemons: DaemonRegistryEntry[];
}

const DEFAULT_REGISTRY_PATH = join(SUPERSET_HOME_DIR, "terminal-daemons.json");
const DEBUG_REGISTRY = process.env.SUPERSET_TERMINAL_DEBUG === "1";
const REGISTRY_LOCK_TIMEOUT_MS = 5_000;
const REGISTRY_LOCK_STALE_MS = 30_000;
const REGISTRY_LOCK_RETRY_MS = 25;
const LOCK_SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function nowIso(): string {
	return new Date().toISOString();
}

function isFinitePositiveInt(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

function isProcessAlive(pid: number): boolean {
	if (!isFinitePositiveInt(pid)) {
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function tryUnlink(path: string): void {
	try {
		if (existsSync(path)) {
			unlinkSync(path);
		}
	} catch {
		// best effort cleanup
	}
}

function sortEntries(entries: DaemonRegistryEntry[]): DaemonRegistryEntry[] {
	return [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function sleepSync(ms: number): void {
	try {
		Atomics.wait(LOCK_SLEEP_BUFFER, 0, 0, ms);
	} catch {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			// busy-wait fallback; should be rare
		}
	}
}

export class TerminalDaemonRegistry {
	constructor(private readonly registryPath = DEFAULT_REGISTRY_PATH) {}

	getPath(): string {
		return this.registryPath;
	}

	read(): DaemonRegistryEntry[] {
		const loaded = this.readFile();
		return sortEntries(loaded.daemons);
	}

	write(entries: DaemonRegistryEntry[]): void {
		this.withLock(() => {
			this.writeFile({ version: 1, daemons: sortEntries(entries) });
		});
	}

	get(generationId: string): DaemonRegistryEntry | null {
		return (
			this.read().find((daemon) => daemon.generationId === generationId) ?? null
		);
	}

	getPreferred(): DaemonRegistryEntry | null {
		const preferred = this.read().filter(
			(daemon) => daemon.state === "preferred",
		);
		if (preferred.length === 0) {
			return null;
		}
		return preferred[preferred.length - 1] ?? null;
	}

	upsert(
		entry: Omit<DaemonRegistryEntry, "createdAt" | "updatedAt" | "lastSeenAt">,
	): DaemonRegistryEntry {
		return this.mutate((daemons) => {
			const now = nowIso();
			const existing = daemons.find(
				(daemon) => daemon.generationId === entry.generationId,
			);

			const next: DaemonRegistryEntry = existing
				? {
						...existing,
						...entry,
						updatedAt: now,
						lastSeenAt: now,
					}
				: {
						...entry,
						createdAt: now,
						updatedAt: now,
						lastSeenAt: now,
					};

			const filtered = daemons.filter(
				(daemon) => daemon.generationId !== entry.generationId,
			);
			filtered.push(next);
			return { entries: filtered, result: next };
		});
	}

	markLastSeen(generationId: string): void {
		void this.mutate((daemons) => {
			const now = nowIso();
			return {
				entries: daemons.map((daemon) =>
					daemon.generationId === generationId
						? { ...daemon, lastSeenAt: now }
						: daemon,
				),
				result: undefined,
			};
		});
	}

	heartbeat(
		entry: Omit<DaemonRegistryEntry, "createdAt" | "updatedAt" | "lastSeenAt">,
	): DaemonRegistryEntry {
		return this.mutate((daemons) => {
			const now = nowIso();
			const existing = daemons.find(
				(daemon) => daemon.generationId === entry.generationId,
			);
			const next: DaemonRegistryEntry = existing
				? {
						...existing,
						socketPath: entry.socketPath,
						pid: entry.pid,
						appVersion: entry.appVersion,
						lastSeenAt: now,
					}
				: {
						...entry,
						createdAt: now,
						updatedAt: now,
						lastSeenAt: now,
					};

			const filtered = daemons.filter(
				(daemon) => daemon.generationId !== entry.generationId,
			);
			filtered.push(next);
			return { entries: filtered, result: next };
		});
	}

	setState(generationId: string, state: DaemonState): void {
		void this.mutate((daemons) => {
			const now = nowIso();
			return {
				entries: daemons.map((daemon) =>
					daemon.generationId === generationId
						? { ...daemon, state, updatedAt: now }
						: daemon,
				),
				result: undefined,
			};
		});
	}

	remove(generationId: string): void {
		void this.mutate((daemons) => ({
			entries: daemons.filter((daemon) => daemon.generationId !== generationId),
			result: undefined,
		}));
	}

	markPreferredGeneration(generationId: string): void {
		void this.mutate((daemons) => {
			const now = nowIso();
			return {
				entries: daemons.map((daemon) => {
					if (daemon.generationId === generationId) {
						return { ...daemon, state: "preferred" as const, updatedAt: now };
					}
					if (daemon.state === "preferred") {
						return { ...daemon, state: "draining" as const, updatedAt: now };
					}
					return daemon;
				}),
				result: undefined,
			};
		});
	}

	listActive(): DaemonRegistryEntry[] {
		return this.read().filter((daemon) => daemon.state !== "retired");
	}

	cleanupStaleDaemons(): {
		removedGenerations: string[];
		removedSockets: string[];
	} {
		return this.mutate((daemons) => {
			const removedGenerations: string[] = [];
			const removedSockets: string[] = [];
			const retained: DaemonRegistryEntry[] = [];

			for (const daemon of daemons) {
				const pidAlive = isProcessAlive(daemon.pid);
				const socketExists = existsSync(daemon.socketPath);

				if (!pidAlive && socketExists) {
					tryUnlink(daemon.socketPath);
					removedSockets.push(daemon.socketPath);
				}

				if (!pidAlive) {
					removedGenerations.push(daemon.generationId);
					continue;
				}

				retained.push(daemon);
			}

			if (
				DEBUG_REGISTRY &&
				(removedGenerations.length > 0 || removedSockets.length > 0)
			) {
				console.log("[TerminalDaemonRegistry] Cleaned stale daemon entries", {
					removedGenerations,
					removedSockets,
				});
			}

			return {
				entries: retained,
				result: { removedGenerations, removedSockets },
			};
		});
	}

	private mutate<T>(
		mutation: (entries: DaemonRegistryEntry[]) => {
			entries: DaemonRegistryEntry[];
			result: T;
		},
	): T {
		return this.withLock(() => {
			const loaded = this.readFile();
			const { entries, result } = mutation(sortEntries(loaded.daemons));
			this.writeFile({ version: 1, daemons: sortEntries(entries) });
			return result;
		});
	}

	private withLock<T>(operation: () => T): T {
		ensureSupersetHomeDirExists();
		const lockPath = `${this.registryPath}.lock`;
		const startTime = Date.now();

		while (true) {
			try {
				const fd = openSync(lockPath, "wx", SUPERSET_SENSITIVE_FILE_MODE);
				try {
					writeFileSync(
						fd,
						JSON.stringify({
							pid: process.pid,
							acquiredAt: Date.now(),
						}),
						"utf-8",
					);
				} finally {
					closeSync(fd);
				}

				try {
					chmodSync(lockPath, SUPERSET_SENSITIVE_FILE_MODE);
				} catch {
					// best effort
				}

				try {
					return operation();
				} finally {
					tryUnlink(lockPath);
				}
			} catch {
				if (this.tryRecoverStaleLock(lockPath)) {
					continue;
				}

				if (Date.now() - startTime >= REGISTRY_LOCK_TIMEOUT_MS) {
					throw new Error(
						`Timed out acquiring terminal daemon registry lock for ${this.registryPath}`,
					);
				}

				sleepSync(REGISTRY_LOCK_RETRY_MS);
			}
		}
	}

	private tryRecoverStaleLock(lockPath: string): boolean {
		if (!existsSync(lockPath)) {
			return false;
		}

		try {
			const raw = readFileSync(lockPath, "utf-8").trim();
			if (!raw) {
				tryUnlink(lockPath);
				return true;
			}

			const parsed = JSON.parse(raw) as {
				pid?: number;
				acquiredAt?: number;
			};
			const pidAlive =
				typeof parsed.pid === "number" ? isProcessAlive(parsed.pid) : false;
			const acquiredAt =
				typeof parsed.acquiredAt === "number" ? parsed.acquiredAt : 0;
			const stale =
				!pidAlive || Date.now() - acquiredAt > REGISTRY_LOCK_STALE_MS;
			if (!stale) {
				return false;
			}
		} catch {
			// If we cannot parse the lock, treat it as stale and replace it.
		}

		tryUnlink(lockPath);
		return true;
	}

	private readFile(): DaemonRegistryFile {
		if (!existsSync(this.registryPath)) {
			return { version: 1, daemons: [] };
		}

		try {
			const raw = readFileSync(this.registryPath, "utf-8");
			if (!raw.trim()) {
				return { version: 1, daemons: [] };
			}
			const parsed = JSON.parse(raw) as DaemonRegistryFile;
			if (
				parsed.version !== 1 ||
				!Array.isArray(parsed.daemons) ||
				parsed.daemons.some(
					(entry) =>
						typeof entry.generationId !== "string" ||
						typeof entry.socketPath !== "string" ||
						typeof entry.appVersion !== "string" ||
						!isFinitePositiveInt(entry.pid),
				)
			) {
				throw new Error("Invalid daemon registry schema");
			}
			return parsed;
		} catch (error) {
			const backupPath = `${this.registryPath}.corrupt.${Date.now()}`;
			try {
				renameSync(this.registryPath, backupPath);
			} catch {
				// best effort
			}
			console.warn(
				"[TerminalDaemonRegistry] Registry was corrupt and has been reset",
				{
					registryPath: this.registryPath,
					backupPath,
					error: error instanceof Error ? error.message : String(error),
				},
			);
			return { version: 1, daemons: [] };
		}
	}

	private writeFile(file: DaemonRegistryFile): void {
		const tempPath = `${this.registryPath}.tmp`;
		const payload = `${JSON.stringify(file, null, 2)}\n`;

		writeFileSync(tempPath, payload, { mode: SUPERSET_SENSITIVE_FILE_MODE });
		try {
			chmodSync(tempPath, SUPERSET_SENSITIVE_FILE_MODE);
		} catch {
			// best effort
		}
		renameSync(tempPath, this.registryPath);
		try {
			chmodSync(this.registryPath, SUPERSET_SENSITIVE_FILE_MODE);
		} catch {
			// best effort
		}
	}
}

let registryInstance: TerminalDaemonRegistry | null = null;

export function getTerminalDaemonRegistry(): TerminalDaemonRegistry {
	if (!registryInstance) {
		registryInstance = new TerminalDaemonRegistry();
	}
	return registryInstance;
}
