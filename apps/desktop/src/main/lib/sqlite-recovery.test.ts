import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Sentry + electron-log are external to the unit under test; stub them so the
// recovery path never touches a real reporter or transport.
mock.module("@sentry/electron/main", () => ({
	captureException: mock(() => {}),
}));
mock.module("electron-log/main", () => ({
	default: {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		transports: { file: { level: "info" } },
	},
}));

const {
	isSqliteCorruptionError,
	quarantineCorruptDatabase,
	openSqliteWithRecovery,
} = await import("./sqlite-recovery");

function makeSqliteError(code: string): Error & { code: string } {
	const error = new Error(`sqlite failure: ${code}`) as Error & {
		code: string;
	};
	error.code = code;
	return error;
}

describe("isSqliteCorruptionError", () => {
	test.each([
		["SQLITE_CORRUPT", true],
		["SQLITE_CORRUPT_VTAB", true],
		["SQLITE_NOTADB", true],
		["SQLITE_BUSY", false],
		["SQLITE_FULL", false],
	])("%s -> %p", (code, expected) => {
		expect(isSqliteCorruptionError(makeSqliteError(code))).toBe(expected);
	});

	test("returns false for errors without a code", () => {
		expect(isSqliteCorruptionError(new Error("boom"))).toBe(false);
	});

	test("returns false for non-error values", () => {
		expect(isSqliteCorruptionError(null)).toBe(false);
		expect(isSqliteCorruptionError("SQLITE_CORRUPT")).toBe(false);
		expect(isSqliteCorruptionError({ code: 11 })).toBe(false);
	});
});

describe("quarantineCorruptDatabase", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "sqlite-recovery-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test("renames the main file and existing sidecars aside", () => {
		const dbPath = join(dir, "db.sqlite");
		writeFileSync(dbPath, "main");
		writeFileSync(`${dbPath}-wal`, "wal");
		writeFileSync(`${dbPath}-shm`, "shm");

		const quarantined = quarantineCorruptDatabase(dbPath);

		expect(existsSync(dbPath)).toBe(false);
		expect(existsSync(`${dbPath}-wal`)).toBe(false);
		expect(existsSync(`${dbPath}-shm`)).toBe(false);
		expect(existsSync(quarantined)).toBe(true);
		expect(existsSync(`${quarantined}-wal`)).toBe(true);
		expect(existsSync(`${quarantined}-shm`)).toBe(true);
	});

	test("tolerates missing sidecars", () => {
		const dbPath = join(dir, "db.sqlite");
		writeFileSync(dbPath, "main");

		expect(() => quarantineCorruptDatabase(dbPath)).not.toThrow();
		expect(existsSync(dbPath)).toBe(false);
	});
});

describe("openSqliteWithRecovery", () => {
	let dir: string;
	let dbPath: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "sqlite-recovery-"));
		dbPath = join(dir, "db.sqlite");
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	// Reproduces the issue: a corrupt tanstack-db.sqlite made every launch throw
	// SQLITE_CORRUPT. Recovery must quarantine the bad file and reopen cleanly.
	test("quarantines and retries once on corruption", () => {
		writeFileSync(dbPath, "garbage");
		writeFileSync(`${dbPath}-wal`, "garbage");
		writeFileSync(`${dbPath}-shm`, "garbage");

		let attempts = 0;
		const result = openSqliteWithRecovery(dbPath, "test-db", () => {
			attempts += 1;
			if (attempts === 1) throw makeSqliteError("SQLITE_CORRUPT");
			return "fresh-db";
		});

		expect(result).toBe("fresh-db");
		expect(attempts).toBe(2);
		expect(existsSync(dbPath)).toBe(false);
		// the corrupt file was renamed aside, not deleted
		const quarantined = require("node:fs")
			.readdirSync(dir)
			.find((f: string) => f.includes(".corrupt-"));
		expect(quarantined).toBeDefined();
	});

	test("recovers when sidecars are absent", () => {
		writeFileSync(dbPath, "garbage");

		let attempts = 0;
		const result = openSqliteWithRecovery(dbPath, "test-db", () => {
			attempts += 1;
			if (attempts === 1) throw makeSqliteError("SQLITE_NOTADB");
			return "fresh-db";
		});

		expect(result).toBe("fresh-db");
		expect(attempts).toBe(2);
	});

	test("rethrows non-corruption errors without touching files", () => {
		writeFileSync(dbPath, "valid");

		expect(() =>
			openSqliteWithRecovery(dbPath, "test-db", () => {
				throw makeSqliteError("SQLITE_BUSY");
			}),
		).toThrow("SQLITE_BUSY");
		expect(existsSync(dbPath)).toBe(true);
	});

	test("propagates a second failure instead of retrying forever", () => {
		writeFileSync(dbPath, "garbage");

		let attempts = 0;
		expect(() =>
			openSqliteWithRecovery(dbPath, "test-db", () => {
				attempts += 1;
				throw makeSqliteError("SQLITE_CORRUPT");
			}),
		).toThrow("SQLITE_CORRUPT");
		expect(attempts).toBe(2);
	});

	test("returns the opened resource when there is no corruption", () => {
		const result = openSqliteWithRecovery(dbPath, "test-db", () => "ok");
		expect(result).toBe("ok");
	});
});
