import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isSqliteCorruptionError,
	openSqliteWithRecovery,
	quarantineCorruptDatabase,
} from "./sqlite-recovery";

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), "superset-sqlite-recovery-"));
}

function corruptionError(code: string): Error & { code: string } {
	const error = new Error(
		`${code}: database disk image is malformed`,
	) as Error & {
		code: string;
	};
	error.code = code;
	return error;
}

describe("isSqliteCorruptionError", () => {
	test("detects SQLITE_CORRUPT and its variants", () => {
		expect(isSqliteCorruptionError(corruptionError("SQLITE_CORRUPT"))).toBe(
			true,
		);
		expect(
			isSqliteCorruptionError(corruptionError("SQLITE_CORRUPT_VTAB")),
		).toBe(true);
	});

	test("detects SQLITE_NOTADB", () => {
		expect(isSqliteCorruptionError(corruptionError("SQLITE_NOTADB"))).toBe(
			true,
		);
	});

	test("ignores non-corruption SQLite errors", () => {
		expect(isSqliteCorruptionError(corruptionError("SQLITE_BUSY"))).toBe(false);
		expect(isSqliteCorruptionError(corruptionError("SQLITE_CANTOPEN"))).toBe(
			false,
		);
	});

	test("ignores non-error values", () => {
		expect(isSqliteCorruptionError(null)).toBe(false);
		expect(isSqliteCorruptionError(undefined)).toBe(false);
		expect(isSqliteCorruptionError("SQLITE_CORRUPT")).toBe(false);
		expect(isSqliteCorruptionError(new Error("boom"))).toBe(false);
	});
});

describe("quarantineCorruptDatabase", () => {
	test("renames the DB aside with a .corrupt-<timestamp> suffix", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "corrupt");

			const quarantinePath = quarantineCorruptDatabase(dbPath, 1234);

			expect(existsSync(dbPath)).toBe(false);
			expect(quarantinePath).toBe(`${dbPath}.corrupt-1234`);
			expect(existsSync(quarantinePath)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("also quarantines -wal and -shm sidecars", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "corrupt");
			writeFileSync(`${dbPath}-wal`, "wal");
			writeFileSync(`${dbPath}-shm`, "shm");

			const quarantinePath = quarantineCorruptDatabase(dbPath, 1234);

			expect(existsSync(`${dbPath}-wal`)).toBe(false);
			expect(existsSync(`${dbPath}-shm`)).toBe(false);
			expect(existsSync(`${quarantinePath}-wal`)).toBe(true);
			expect(existsSync(`${quarantinePath}-shm`)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("does not fail when sidecars are absent", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "corrupt");

			expect(() => quarantineCorruptDatabase(dbPath, 1234)).not.toThrow();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("openSqliteWithRecovery", () => {
	test("retries once against a fresh DB after quarantining a corrupt one", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "corrupt");

			let attempts = 0;
			const result = openSqliteWithRecovery(dbPath, () => {
				attempts += 1;
				if (attempts === 1) {
					throw corruptionError("SQLITE_CORRUPT");
				}
				return "fresh-db";
			});

			expect(result).toBe("fresh-db");
			expect(attempts).toBe(2);
			expect(existsSync(dbPath)).toBe(false);
			const quarantined = readdirSync(dir).filter((name) =>
				name.includes(".corrupt-"),
			);
			expect(quarantined.length).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rethrows non-corruption errors without quarantining", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "fine");

			let attempts = 0;
			expect(() =>
				openSqliteWithRecovery(dbPath, () => {
					attempts += 1;
					throw corruptionError("SQLITE_BUSY");
				}),
			).toThrow("SQLITE_BUSY");

			expect(attempts).toBe(1);
			expect(existsSync(dbPath)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("propagates a second corruption failure", () => {
		const dir = makeTempDir();
		try {
			const dbPath = join(dir, "tanstack-db.sqlite");
			writeFileSync(dbPath, "corrupt");

			let attempts = 0;
			expect(() =>
				openSqliteWithRecovery(dbPath, () => {
					attempts += 1;
					throw corruptionError("SQLITE_CORRUPT");
				}),
			).toThrow("SQLITE_CORRUPT");

			expect(attempts).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
