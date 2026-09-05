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

	it("falls back to defaults on a corrupt settings file and logs once", () => {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		writeFileSync(join(dir, "settings.json"), "{not json");

		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const state = new EngineState();
			expect(state.readSettings()).toEqual(defaultEngineSettings());
			expect(state.readSettings()).toEqual(defaultEngineSettings());
			expect(warn).toHaveBeenCalledTimes(1);
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
