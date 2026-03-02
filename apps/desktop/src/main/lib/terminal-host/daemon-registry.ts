import {
	chmodSync,
	existsSync,
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
		this.writeFile({ version: 1, daemons: sortEntries(entries) });
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
		const now = nowIso();
		const daemons = this.read();
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
		this.write(filtered);
		return next;
	}

	markLastSeen(generationId: string): void {
		const daemons = this.read();
		const now = nowIso();
		const updated = daemons.map((daemon) =>
			daemon.generationId === generationId
				? { ...daemon, lastSeenAt: now }
				: daemon,
		);
		this.write(updated);
	}

	setState(generationId: string, state: DaemonState): void {
		const daemons = this.read();
		const now = nowIso();
		const updated = daemons.map((daemon) =>
			daemon.generationId === generationId
				? { ...daemon, state, updatedAt: now }
				: daemon,
		);
		this.write(updated);
	}

	remove(generationId: string): void {
		const daemons = this.read().filter(
			(daemon) => daemon.generationId !== generationId,
		);
		this.write(daemons);
	}

	markPreferredGeneration(generationId: string): void {
		const daemons = this.read();
		const now = nowIso();
		const updated = daemons.map((daemon) => {
			if (daemon.generationId === generationId) {
				return { ...daemon, state: "preferred" as const, updatedAt: now };
			}
			if (daemon.state === "preferred") {
				return { ...daemon, state: "draining" as const, updatedAt: now };
			}
			return daemon;
		});
		this.write(updated);
	}

	listActive(): DaemonRegistryEntry[] {
		return this.read().filter((daemon) => daemon.state !== "retired");
	}

	cleanupStaleDaemons(): {
		removedGenerations: string[];
		removedSockets: string[];
	} {
		const daemons = this.read();
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

		this.write(retained);

		if (
			DEBUG_REGISTRY &&
			(removedGenerations.length > 0 || removedSockets.length > 0)
		) {
			console.log("[TerminalDaemonRegistry] Cleaned stale daemon entries", {
				removedGenerations,
				removedSockets,
			});
		}

		return { removedGenerations, removedSockets };
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
		ensureSupersetHomeDirExists();

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
