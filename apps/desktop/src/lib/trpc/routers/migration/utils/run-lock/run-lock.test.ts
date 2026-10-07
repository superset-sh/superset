import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunLock } from "./run-lock";

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "v1-run-lock-"));
	path = join(dir, "v1-migration.lock");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("createRunLock", () => {
	test("a second holder in the same process waits until the first releases", () => {
		const lock = createRunLock({ path, pid: 100, isAlive: () => true });
		const first = lock.acquire();
		expect(first.acquired).toBe(true);

		expect(lock.acquire()).toEqual({ acquired: false });

		if (!first.acquired) throw new Error("unreachable");
		expect(lock.release(first.token)).toBe(true);
		expect(lock.acquire().acquired).toBe(true);
	});

	test("a stale token does not release the lock a later holder took", () => {
		const lock = createRunLock({ path, pid: 100, isAlive: () => true });
		const first = lock.acquire();
		if (!first.acquired) throw new Error("expected the lock");
		lock.release(first.token);
		const second = lock.acquire();
		if (!second.acquired) throw new Error("expected the lock");

		expect(lock.release(first.token)).toBe(false);
		expect(existsSync(path)).toBe(true);
		expect(lock.acquire()).toEqual({ acquired: false });
	});

	test("a live lock from another process is respected", () => {
		writeFileSync(path, JSON.stringify({ pid: 200, at: Date.now() }));
		const lock = createRunLock({ path, pid: 100, isAlive: () => true });
		expect(lock.acquire()).toEqual({ acquired: false });
	});

	test("a lock left by a dead process or a reused pid is stolen", () => {
		writeFileSync(path, JSON.stringify({ pid: 200, at: Date.now() }));
		const dead = createRunLock({ path, pid: 100, isAlive: () => false });
		expect(dead.acquire().acquired).toBe(true);

		rmSync(path);
		writeFileSync(path, JSON.stringify({ pid: 100, at: Date.now() }));
		const reused = createRunLock({ path, pid: 100, isAlive: () => true });
		expect(reused.acquire().acquired).toBe(true);
	});
});
