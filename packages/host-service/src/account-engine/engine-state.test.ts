import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_LOCK_STALE_MS,
	defaultEngineSettings,
	EngineState,
} from "./engine-state.ts";
import type { HistoryEntry } from "./types.ts";

const TOKEN_MATERIAL = /accessToken|refreshToken|sk-ant|eyJ/;

function historyEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
	return {
		at: 1_700_000_000_000,
		agent: "claude",
		fromAccountId: "acct-a",
		fromLabel: "work",
		toAccountId: "acct-b",
		toLabel: "personal",
		reasonKind: "threshold",
		windowId: "five_hour",
		usedPercent: 92,
		fallbackRestart: false,
		...overrides,
	};
}

function filesUnder(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...filesUnder(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

describe("account-engine state", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-engine-state-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("returns defaults when no files exist and round-trips settings", () => {
		const state = new EngineState();

		expect(state.readSettings()).toEqual(defaultEngineSettings());
		expect(state.readRotation()).toEqual({});
		expect(state.readQuotaSnapshot()).toBeNull();
		expect(state.readHistory(10)).toEqual([]);
		expect(state.readRuntime().version).toBe(1);
		expect(state.readRuntime().perAgent.claude.cooldownUntil).toBeNull();

		const settings = defaultEngineSettings();
		settings.claude = {
			enabled: true,
			thresholdPercent: 75,
			strategy: "consume-first",
			modelWindows: ["Opus 4.6"],
			pollIntervalSeconds: 30,
			cooldownSeconds: 120,
		};
		state.writeSettings(settings);
		expect(new EngineState().readSettings()).toEqual(settings);

		state.writeRotation({ "claude:work": true, "codex:personal": false });
		expect(new EngineState().readRotation()).toEqual({
			"claude:work": true,
			"codex:personal": false,
		});

		const runtime = state.readRuntime();
		runtime.perAgent.claude.cooldownUntil = 42;
		runtime.perAgent.claude.activeAccountId = "acct-b";
		runtime.identityBindings["acct-b"] = join(home, "accounts", "claude-b");
		runtime.identityBindings["acct-system"] = null;
		runtime.keychain = { service: "Claude Code", account: "acct-b" };
		state.writeRuntime(runtime);
		expect(new EngineState().readRuntime()).toEqual(runtime);

		state.writeQuotaSnapshot({ "claude:work": { usedPercent: 12 } }, 1234);
		expect(new EngineState().readQuotaSnapshot()).toEqual({
			writtenAt: 1234,
			data: { "claude:work": { usedPercent: 12 } },
		});
	});

	it("elects exactly one owner when two claimants race on a stale lock", () => {
		const first = new EngineState();
		const now = 10_000_000;
		expect(first.claimLock("nonce-a", now - DEFAULT_LOCK_STALE_MS - 1)).toBe(
			true,
		);

		const second = new EngineState();
		const third = new EngineState();
		const winners = [
			second.claimLock("nonce-b", now),
			third.claimLock("nonce-c", now),
		].filter(Boolean);

		expect(winners).toHaveLength(1);
		expect([second.isOwner("nonce-b"), third.isOwner("nonce-c")]).toContain(
			true,
		);
		expect(first.isOwner("nonce-a")).toBe(false);
	});

	it("reports not-owner once the nonce on disk was overwritten", () => {
		const state = new EngineState();
		expect(state.claimLock("nonce-a", 1000)).toBe(true);
		expect(state.isOwner("nonce-a")).toBe(true);

		writeFileSync(
			join(home, "state", "account-engine", "engine.lock"),
			JSON.stringify({
				nonce: "nonce-z",
				startedAt: 1000,
				heartbeatAt: 1000,
			}),
		);
		expect(state.isOwner("nonce-a")).toBe(false);
		expect(state.heartbeat("nonce-a", 2000)).toBe(false);
	});

	it("blocks reclaim on a fresh heartbeat, allows it on a stale one, and never reads pids", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000_000)).toBe(true);

		const rival = new EngineState();
		expect(rival.claimLock("nonce-b", 1_000_000 + DEFAULT_LOCK_STALE_MS)).toBe(
			false,
		);

		expect(owner.heartbeat("nonce-a", 2_000_000)).toBe(true);
		expect(rival.claimLock("nonce-b", 2_000_000 + 1000)).toBe(false);

		// A lock stamped with this very much alive pid must still be reclaimed
		// once its heartbeat is stale: pid liveness is never consulted.
		writeFileSync(
			join(home, "state", "account-engine", "engine.lock"),
			JSON.stringify({
				nonce: "nonce-dead",
				startedAt: 1,
				heartbeatAt: 1,
				pid: process.pid,
			}),
		);
		expect(rival.claimLock("nonce-b", 2_000_000 + DEFAULT_LOCK_STALE_MS)).toBe(
			true,
		);
		expect(rival.isOwner("nonce-b")).toBe(true);
	});

	// The heartbeat stages its write and then re-reads the nonce: without that
	// second read, an owner whose lock was reclaimed mid-refresh renames its
	// stale record back over the new owner's and both believe they own the host.
	it("refuses a heartbeat whose lock was reclaimed under it", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000_000)).toBe(true);

		const rival = new EngineState();
		expect(
			rival.claimLock("nonce-b", 1_000_000 + DEFAULT_LOCK_STALE_MS + 1),
		).toBe(true);

		// The old owner still thinks it holds the lock and refreshes.
		expect(
			owner.heartbeat("nonce-a", 1_000_000 + DEFAULT_LOCK_STALE_MS + 2),
		).toBe(false);
		expect(owner.isOwner("nonce-a")).toBe(false);
		expect(rival.isOwner("nonce-b")).toBe(true);
		expect(
			readdirSync(join(home, "state", "account-engine")).filter((name) =>
				name.endsWith(".tmp"),
			),
		).toEqual([]);
	});

	it("abandons a heartbeat reclaimed between the nonce check and the write", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000)).toBe(true);
		const lockPath = join(home, "state", "account-engine", "engine.lock");

		// The window the compare-and-swap closes is inside one synchronous
		// call, so it is opened here: the lock is still ours when the heartbeat
		// reads it, and a rival owns it by the time the rename would land.
		type LockReader = { readLockFile(): unknown };
		const seam = owner as unknown as LockReader;
		const realRead = seam.readLockFile.bind(owner);
		let reads = 0;
		seam.readLockFile = () => {
			reads += 1;
			const seen = realRead();
			if (reads === 1) {
				writeFileSync(
					lockPath,
					JSON.stringify({
						nonce: "nonce-b",
						startedAt: 2_000,
						heartbeatAt: 2_000,
					}),
					{ mode: 0o600 },
				);
			}
			return seen;
		};

		expect(owner.heartbeat("nonce-a", 3_000)).toBe(false);
		expect(JSON.parse(readFileSync(lockPath, "utf8")).nonce).toBe("nonce-b");
		expect(
			readdirSync(join(home, "state", "account-engine")).filter((name) =>
				name.endsWith(".tmp"),
			),
		).toEqual([]);
	});

	it("never overwrites a successor's lock when a takeover lands mid-heartbeat", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000)).toBe(true);
		const dir = join(home, "state", "account-engine");
		const lockPath = join(dir, "engine.lock");
		const rival = new EngineState();

		// The window a rename could never close: the lock is verified as ours,
		// and only then does a rival rename our inode aside and link its own.
		// The refreshed record must land on the inode we opened, never here.
		type LockHolder = {
			holdsLock(fd: number, target: string, nonce: string): boolean;
		};
		const seam = owner as unknown as LockHolder;
		const realHolds = seam.holdsLock.bind(owner);
		let raced = false;
		seam.holdsLock = (fd, target, nonce) => {
			const held = realHolds(fd, target, nonce);
			if (!raced) {
				raced = true;
				rival.claimLock("nonce-b", 1_000 + DEFAULT_LOCK_STALE_MS + 1);
			}
			return held;
		};

		owner.heartbeat("nonce-a", 2_000);

		expect(raced).toBe(true);
		expect(JSON.parse(readFileSync(lockPath, "utf8")).nonce).toBe("nonce-b");
		expect(rival.isOwner("nonce-b")).toBe(true);
		// The loss is reported by the next ownership check, which re-reads the
		// path and finds the foreign nonce on a fresh heartbeat.
		expect(owner.isOwner("nonce-a")).toBe(false);
		expect(owner.claimLock("nonce-a", 2_100)).toBe(false);
		expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
			[],
		);
	});

	it("leaves a successor's lock in place when a release races a takeover", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000)).toBe(true);
		const lockPath = join(home, "state", "account-engine", "engine.lock");
		const rival = new EngineState();

		// Ours at the ownership check, the rival's by the time the unlink would
		// run: releasing here would leave the host unlocked under a live owner.
		type LockReader = { readLockFile(): unknown };
		const seam = owner as unknown as LockReader;
		const realRead = seam.readLockFile.bind(owner);
		let reads = 0;
		seam.readLockFile = () => {
			reads += 1;
			const seen = realRead();
			if (reads === 1) {
				rival.claimLock("nonce-b", 1_000 + DEFAULT_LOCK_STALE_MS + 1);
			}
			return seen;
		};

		owner.releaseLock("nonce-a");

		expect(JSON.parse(readFileSync(lockPath, "utf8")).nonce).toBe("nonce-b");
		expect(rival.isOwner("nonce-b")).toBe(true);
	});

	it("keeps refreshing while the lock is still ours", () => {
		const owner = new EngineState();
		expect(owner.claimLock("nonce-a", 1_000)).toBe(true);
		expect(owner.heartbeat("nonce-a", 2_000)).toBe(true);

		const lock = JSON.parse(
			readFileSync(
				join(home, "state", "account-engine", "engine.lock"),
				"utf8",
			),
		);
		expect(lock).toEqual({
			nonce: "nonce-a",
			startedAt: 1_000,
			heartbeatAt: 2_000,
		});
	});

	it("falls back to defaults on a corrupt settings file and logs once", () => {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		writeFileSync(join(dir, "settings.json"), "{not json");

		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const state = new EngineState();
			expect(state.readSettings()).toEqual(defaultEngineSettings());
			expect(state.readSettings()).toEqual(defaultEngineSettings());
			// console.warn is process-global: count only this file's warning so
			// another suite's late async log line cannot fail the once-guard.
			const ours = warn.mock.calls.filter((call) =>
				String(call[0]).includes("settings.json is not valid JSON"),
			);
			expect(ours).toHaveLength(1);
		} finally {
			warn.mockRestore();
		}
	});

	it("falls back to defaults when a settings value is out of range", () => {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({
				claude: { enabled: true, thresholdPercent: 900 },
				codex: { enabled: true, pollIntervalSeconds: 60 },
			}),
		);

		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const settings = new EngineState().readSettings();
			expect(settings.claude).toEqual(defaultEngineSettings().claude);
			expect(settings.codex.enabled).toBe(true);
			expect(settings.codex.thresholdPercent).toBe(90);
		} finally {
			warn.mockRestore();
		}
	});

	it("appends history in order, reads it newest first, and caps the file", () => {
		const state = new EngineState();
		state.appendHistory(historyEntry({ at: 1, toLabel: "one" }));
		state.appendHistory(historyEntry({ at: 2, toLabel: "two" }));
		state.appendHistory(historyEntry({ at: 3, toLabel: "three" }));

		const newestFirst = state.readHistory(10);
		expect(newestFirst.map((entry) => entry.toLabel)).toEqual([
			"three",
			"two",
			"one",
		]);
		expect(state.readHistory(2).map((entry) => entry.at)).toEqual([3, 2]);

		const historyPath = join(home, "state", "account-engine", "history.jsonl");
		const before = statSync(historyPath).size;
		for (let index = 0; index < 4000; index++) {
			state.appendHistory(historyEntry({ at: 100 + index }));
		}
		const after = statSync(historyPath).size;
		expect(after).toBeGreaterThan(before);
		expect(after).toBeLessThanOrEqual(512 * 1024);
		// Rotation keeps the newest half, so the newest entry survives.
		expect(state.readHistory(1)[0]?.at).toBe(4099);
	});

	it("goes read-only and logs once when the state dir is writable by others", () => {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		chmodSync(dir, 0o777);

		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const state = new EngineState();
			expect(state.assertSafeStateDir().readOnly).toBe(true);
			expect(state.assertSafeStateDir().reason).toBeTruthy();
			expect(state.assertSafeStateDir().readOnly).toBe(true);
			expect(warn).toHaveBeenCalledTimes(1);

			const settings = defaultEngineSettings();
			settings.claude.enabled = true;
			state.writeSettings(settings);
			state.appendHistory(historyEntry());
			expect(state.claimLock("nonce-a", 1000)).toBe(false);

			chmodSync(dir, 0o700);
			expect(new EngineState().readSettings()).toEqual(defaultEngineSettings());
			expect(new EngineState().readHistory(10)).toEqual([]);
		} finally {
			chmodSync(dir, 0o700);
			warn.mockRestore();
		}
	});

	it("writes files 0600 inside a 0700 dir and leaves no tmp file behind", () => {
		const state = new EngineState();
		const dir = join(home, "state", "account-engine");

		state.writeSettings(defaultEngineSettings());
		state.writeRotation({ "claude:work": true });
		state.writeRuntime(state.readRuntime());
		state.writeQuotaSnapshot({ ok: true }, 1);
		state.appendHistory(historyEntry());
		expect(state.claimLock("nonce-a", 1000)).toBe(true);

		expect(statSync(dir).mode & 0o777).toBe(0o700);
		for (const file of filesUnder(dir)) {
			expect([file, statSync(file).mode & 0o777]).toEqual([file, 0o600]);
		}

		// A rename that cannot land must not strand its tmp file.
		rmSync(join(dir, "rotation.json"));
		mkdirSync(join(dir, "rotation.json"));
		expect(() => state.writeRotation({ "claude:work": false })).toThrow();
		expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
			[],
		);
	});

	it("never writes token material into any state file", () => {
		const state = new EngineState();
		const settings = defaultEngineSettings();
		settings.claude.enabled = true;
		settings.claude.modelWindows = ["Opus 4.6"];
		state.writeSettings(settings);
		state.writeRotation({ "claude:work": true, "codex:personal": false });

		const runtime = state.readRuntime();
		runtime.perAgent.claude.activeAccountId = "9f1c-uuid";
		runtime.perAgent.claude.activeSelection = "work";
		runtime.identityBindings["9f1c-uuid"] = join(
			home,
			"accounts",
			"claude-active",
		);
		runtime.keychain = { service: "Claude Code-credentials", account: "work" };
		state.writeRuntime(runtime);

		state.writeQuotaSnapshot(
			{ "claude:work": { windows: [{ id: "five_hour", usedPercent: 41 }] } },
			1,
		);
		state.appendHistory(historyEntry());
		state.claimLock("nonce-a", 1000);

		for (const file of filesUnder(join(home, "state", "account-engine"))) {
			expect([file, TOKEN_MATERIAL.test(readFileSync(file, "utf8"))]).toEqual([
				file,
				false,
			]);
		}
	});
});
