/**
 * Host-wide account-engine state (KTD5): per-agent auto-switch settings,
 * rotation flags, switch history, runtime latches, the lock owner's quota
 * snapshot, and the one-engine-per-Superset-home ownership lock.
 *
 * The state lives in $SUPERSET_HOME_DIR/state/account-engine/ rather than an
 * org database because the active account is host-wide and several org
 * host-services share one Superset home. Nothing written here may hold token
 * material — history carries account ids and labels, runtime.json carries
 * bindings and Keychain attributes, never a credential.
 *
 * Files are written tmp-then-rename with mode 0600 inside a 0700 dir,
 * following daemon/manifest.ts, not the 0644 pointer writes in
 * default-account.ts. Reads validate with zod and fall back to defaults, so a
 * corrupt or hand-edited file can never crash the service.
 */

import { randomUUID } from "node:crypto";
import {
	appendFileSync,
	linkSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
	AgentRuntimeState,
	AutoSwitchSettings,
	EngineSettings,
	HistoryEntry,
	QuotaSnapshot,
	RotationState,
	RuntimeState,
} from "./types.ts";

const SETTINGS_FILE = "settings.json";
const ROTATION_FILE = "rotation.json";
const RUNTIME_FILE = "runtime.json";
const QUOTA_FILE = "quota.json";
const HISTORY_FILE = "history.jsonl";
const LOCK_FILE = "engine.lock";

/** Rotated at this size, keeping the newest half. */
const MAX_HISTORY_BYTES = 512 * 1024;

/** Three tick intervals at the 60s default (KTD5); callers may override. */
export const DEFAULT_LOCK_STALE_MS = 3 * 60_000;

/**
 * Mirror of the resolver in default-account.ts. Kept local for the same
 * reason it is kept local there: this state sits under the agent-launch path
 * and must not pull in the agent-setup surface.
 */
function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
}

export function defaultAutoSwitchSettings(): AutoSwitchSettings {
	return {
		enabled: false,
		thresholdPercent: 90,
		strategy: "best",
		modelWindows: [],
		pollIntervalSeconds: 60,
		cooldownSeconds: 300,
	};
}

export function defaultEngineSettings(): EngineSettings {
	return {
		claude: defaultAutoSwitchSettings(),
		codex: defaultAutoSwitchSettings(),
	};
}

export function defaultRuntimeState(): RuntimeState {
	return {
		version: 1,
		perAgent: {
			claude: defaultAgentRuntimeState(),
			codex: defaultAgentRuntimeState(),
		},
		identityBindings: {},
	};
}

function defaultAgentRuntimeState(): AgentRuntimeState {
	return {
		cooldownUntil: null,
		exhaustedNotifiedAt: null,
		fallbackTimestamps: [],
		activeAccountId: null,
		activeSelection: null,
	};
}

const autoSwitchSettingsSchema = z
	.object({
		enabled: z.boolean().default(false),
		thresholdPercent: z.number().int().min(1).max(100).default(90),
		strategy: z.enum(["best", "consume-first"]).default("best"),
		modelWindows: z.array(z.string()).default([]),
		pollIntervalSeconds: z
			.union([z.literal(30), z.literal(60), z.literal(120), z.literal(300)])
			.default(60),
		cooldownSeconds: z.number().int().min(0).default(300),
	})
	// One bad field falls back to that agent's defaults rather than losing the
	// other agent's configuration with it.
	.catch(() => defaultAutoSwitchSettings());

const engineSettingsSchema = z.object({
	claude: autoSwitchSettingsSchema,
	codex: autoSwitchSettingsSchema,
});

const rotationSchema = z.record(z.string(), z.boolean());

const agentRuntimeSchema = z
	.object({
		cooldownUntil: z.number().nullable().default(null),
		exhaustedNotifiedAt: z.number().nullable().default(null),
		fallbackTimestamps: z.array(z.number()).default([]),
		activeAccountId: z.string().nullable().default(null),
		activeSelection: z.string().nullable().default(null),
	})
	.catch(() => defaultAgentRuntimeState());

const runtimeSchema = z.object({
	version: z.literal(1),
	perAgent: z.object({ claude: agentRuntimeSchema, codex: agentRuntimeSchema }),
	identityBindings: z.record(z.string(), z.string().nullable()).default({}),
	keychain: z
		.object({
			service: z.string().nullable(),
			account: z.string().nullable(),
		})
		.optional(),
});

const quotaSnapshotSchema = z.object({
	writtenAt: z.number(),
	data: z.unknown(),
});

const historyEntrySchema = z.object({
	at: z.number(),
	agent: z.enum(["claude", "codex"]),
	fromAccountId: z.string().nullable(),
	fromLabel: z.string().nullable(),
	toAccountId: z.string().nullable(),
	toLabel: z.string().nullable(),
	reasonKind: z.enum([
		"threshold",
		"strategy",
		"manual",
		"fallback",
		"fallback-rejected",
		"external",
	]),
	windowId: z.string().nullable().optional(),
	usedPercent: z.number().nullable().optional(),
	fallbackRestart: z.boolean().optional(),
});

interface LockRecord {
	nonce: string;
	startedAt: number;
	heartbeatAt: number;
}

const lockSchema = z.object({
	nonce: z.string(),
	startedAt: z.number(),
	heartbeatAt: z.number(),
});

export interface StateDirSafety {
	readOnly: boolean;
	reason: string | null;
}

export class EngineState {
	readonly dir: string;
	private readonly warned = new Set<string>();

	constructor() {
		this.dir = join(supersetHomeDir(), "state", "account-engine");
		try {
			mkdirSync(this.dir, { recursive: true, mode: 0o700 });
		} catch {
			// A dir we cannot create is reported by assertSafeStateDir, which
			// every write consults, so the engine degrades to read-only instead
			// of throwing out of a constructor.
		}
	}

	/**
	 * Refuses the state dir when it is not ours or is writable by anyone else:
	 * a second user able to write settings.json could steer which account every
	 * agent on this host runs on. Reported, logged once, never thrown.
	 */
	assertSafeStateDir(): StateDirSafety {
		let stats: ReturnType<typeof statSync>;
		try {
			stats = statSync(this.dir);
		} catch (error) {
			return this.refuse(
				"stat",
				`state dir ${this.dir} is unusable: ${(error as Error).message}`,
			);
		}
		if (!stats.isDirectory()) {
			return this.refuse("notdir", `state path ${this.dir} is not a directory`);
		}
		const uid = process.getuid?.();
		if (
			process.platform !== "win32" &&
			uid !== undefined &&
			stats.uid !== uid
		) {
			return this.refuse(
				"owner",
				`state dir ${this.dir} is owned by uid ${stats.uid}, not ${uid}`,
			);
		}
		if ((stats.mode & 0o022) !== 0) {
			return this.refuse(
				"mode",
				`state dir ${this.dir} is group- or other-writable (mode ${(
					stats.mode & 0o777
				).toString(8)})`,
			);
		}
		return { readOnly: false, reason: null };
	}

	get readOnly(): boolean {
		return this.assertSafeStateDir().readOnly;
	}

	readSettings(): EngineSettings {
		return this.readJson(SETTINGS_FILE, engineSettingsSchema, () =>
			defaultEngineSettings(),
		);
	}

	writeSettings(settings: EngineSettings): void {
		this.writeJson(SETTINGS_FILE, settings);
	}

	readRotation(): RotationState {
		return this.readJson(ROTATION_FILE, rotationSchema, () => ({}));
	}

	writeRotation(rotation: RotationState): void {
		this.writeJson(ROTATION_FILE, rotation);
	}

	readRuntime(): RuntimeState {
		return this.readJson(RUNTIME_FILE, runtimeSchema, () =>
			defaultRuntimeState(),
		);
	}

	writeRuntime(runtime: RuntimeState): void {
		this.writeJson(RUNTIME_FILE, runtime);
	}

	/** Null when the owner has not published a snapshot yet. */
	readQuotaSnapshot(): QuotaSnapshot | null {
		return this.readJson(QUOTA_FILE, quotaSnapshotSchema, () => null);
	}

	writeQuotaSnapshot(data: unknown, now: number): void {
		this.writeJson(QUOTA_FILE, { writtenAt: now, data });
	}

	appendHistory(entry: HistoryEntry): void {
		if (this.assertSafeStateDir().readOnly) return;
		const path = join(this.dir, HISTORY_FILE);
		appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
		this.rotateHistory(path);
	}

	/** Newest first; malformed lines are skipped, not fatal. */
	readHistory(limit = 50): HistoryEntry[] {
		const raw = this.readText(HISTORY_FILE);
		if (raw === null) return [];
		const lines = raw.split("\n");
		const entries: HistoryEntry[] = [];
		for (let index = lines.length - 1; index >= 0; index--) {
			if (entries.length >= limit) break;
			const line = lines[index]?.trim();
			if (!line) continue;
			const parsed = this.parseJson(HISTORY_FILE, line);
			if (parsed === undefined) continue;
			const result = historyEntrySchema.safeParse(parsed);
			if (result.success) entries.push(result.data);
			else {
				this.warnOnce(
					`shape:${HISTORY_FILE}`,
					`${HISTORY_FILE} holds a malformed row; skipping it`,
				);
			}
		}
		return entries;
	}

	/**
	 * Atomic create-if-absent claim (the linkSync idiom already used by
	 * migrateDefaultAccountPointer). A lock whose heartbeat is older than
	 * staleAfterMs is reclaimed by renaming it aside first, so only the process
	 * whose rename succeeded may re-link it. Pid liveness is never consulted:
	 * pids are reused, and the engine may run in another container entirely.
	 */
	claimLock(
		nonce: string,
		now: number,
		staleAfterMs: number = DEFAULT_LOCK_STALE_MS,
	): boolean {
		if (this.assertSafeStateDir().readOnly) return false;
		const lockPath = join(this.dir, LOCK_FILE);
		const { exists, record } = this.readLockFile();
		if (record?.nonce === nonce) return this.heartbeat(nonce, now);
		if (record && now - record.heartbeatAt <= staleAfterMs) return false;
		if (exists) {
			const asidePath = `${lockPath}.stale.${process.pid}.${randomUUID()}`;
			try {
				renameSync(lockPath, asidePath);
			} catch {
				// Another claimant renamed it first; it gets to re-link.
				return false;
			}
			try {
				unlinkSync(asidePath);
			} catch {
				// Best-effort cleanup of the reclaimed lock.
			}
		}
		return this.linkLock(lockPath, {
			nonce,
			startedAt: now,
			heartbeatAt: now,
		});
	}

	/** Refreshes the heartbeat only while the on-disk nonce is still ours. */
	heartbeat(nonce: string, now: number): boolean {
		if (this.assertSafeStateDir().readOnly) return false;
		const { record } = this.readLockFile();
		if (!record || record.nonce !== nonce) return false;
		return this.swapLock(nonce, { ...record, heartbeatAt: now });
	}

	/** Re-reads the lock: a reclaim by another process must be observed. */
	isOwner(nonce: string): boolean {
		return this.readLockFile().record?.nonce === nonce;
	}

	releaseLock(nonce: string): void {
		if (!this.isOwner(nonce)) return;
		try {
			unlinkSync(join(this.dir, LOCK_FILE));
		} catch {
			// Already gone, or reclaimed between the check and the unlink.
		}
	}

	/**
	 * Compare-and-swap the lock file: the replacement is staged first, then the
	 * on-disk nonce is re-read *immediately* before the rename and the write is
	 * abandoned if it is no longer ours. Without that second read a heartbeat
	 * that started while the lock was still ours would happily rename over a
	 * lock another process reclaimed in the meantime, and both engines would
	 * believe they own the host.
	 */
	private swapLock(nonce: string, record: LockRecord): boolean {
		const target = join(this.dir, LOCK_FILE);
		let temporary: string | null = this.temporaryPath(target);
		try {
			writeFileSync(temporary, JSON.stringify(record), {
				mode: 0o600,
				flag: "wx",
			});
			if (this.readLockFile().record?.nonce !== nonce) return false;
			renameSync(temporary, target);
			temporary = null;
			return true;
		} finally {
			this.discard(temporary);
		}
	}

	private linkLock(lockPath: string, record: LockRecord): boolean {
		let temporary: string | null = this.temporaryPath(lockPath);
		try {
			writeFileSync(temporary, JSON.stringify(record), {
				mode: 0o600,
				flag: "wx",
			});
			try {
				linkSync(temporary, lockPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
				throw error;
			}
			return true;
		} finally {
			this.discard(temporary);
			temporary = null;
		}
	}

	private readLockFile(): { exists: boolean; record: LockRecord | null } {
		const raw = this.readText(LOCK_FILE);
		if (raw === null) return { exists: false, record: null };
		const parsed = this.parseJson(LOCK_FILE, raw);
		const result = lockSchema.safeParse(parsed);
		// A corrupt lock counts as present but unowned, so it is reclaimed
		// rather than wedging the engine for good.
		return { exists: true, record: result.success ? result.data : null };
	}

	private rotateHistory(path: string): void {
		let size: number;
		try {
			size = statSync(path).size;
		} catch {
			return;
		}
		if (size <= MAX_HISTORY_BYTES) return;
		const raw = this.readText(HISTORY_FILE);
		if (raw === null) return;
		const lines = raw.split("\n").filter((line) => line.length > 0);
		const kept = lines.slice(Math.floor(lines.length / 2));
		this.writeFileAtomically(path, kept.length ? `${kept.join("\n")}\n` : "");
	}

	private readJson<T, F>(
		name: string,
		schema: z.ZodType<T>,
		fallback: () => F,
	): T | F {
		const raw = this.readText(name);
		if (raw === null) return fallback();
		const parsed = this.parseJson(name, raw);
		if (parsed === undefined) return fallback();
		const result = schema.safeParse(parsed);
		if (result.success) return result.data;
		this.warnOnce(
			`shape:${name}`,
			`${name} has an unexpected shape; falling back to defaults`,
		);
		return fallback();
	}

	private writeJson(name: string, value: unknown): void {
		if (this.assertSafeStateDir().readOnly) return;
		this.writeFileAtomically(join(this.dir, name), JSON.stringify(value));
	}

	private writeFileAtomically(target: string, contents: string): void {
		let temporary: string | null = this.temporaryPath(target);
		try {
			writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
			renameSync(temporary, target);
			temporary = null;
		} finally {
			this.discard(temporary);
		}
	}

	private temporaryPath(target: string): string {
		return `${target}.${process.pid}.${randomUUID()}.tmp`;
	}

	private discard(temporary: string | null): void {
		if (!temporary) return;
		try {
			unlinkSync(temporary);
		} catch {
			// Best-effort cleanup after a failed write, link or rename.
		}
	}

	/** Null when absent; a warn-once otherwise unreadable file also reads null. */
	private readText(name: string): string | null {
		try {
			return readFileSync(join(this.dir, name), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				this.warnOnce(
					`read:${name}`,
					`cannot read ${name}: ${(error as Error).message}`,
				);
			}
			return null;
		}
	}

	private parseJson(name: string, raw: string): unknown {
		try {
			return JSON.parse(raw);
		} catch {
			this.warnOnce(
				`parse:${name}`,
				`${name} is not valid JSON; falling back to defaults`,
			);
			return undefined;
		}
	}

	private refuse(key: string, reason: string): StateDirSafety {
		this.warnOnce(key, reason);
		return { readOnly: true, reason };
	}

	private warnOnce(key: string, message: string): void {
		if (this.warned.has(key)) return;
		this.warned.add(key);
		console.warn(`[account-engine] ${message}`);
	}
}
