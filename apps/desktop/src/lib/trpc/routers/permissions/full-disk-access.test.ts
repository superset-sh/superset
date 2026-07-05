import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkFullDiskAccess } from "./full-disk-access";

const homeDirectory = "/Users/tester";
const tccDatabasePath = path.join(
	homeDirectory,
	"Library",
	"Application Support",
	"com.apple.TCC",
	"TCC.db",
);
const safariHistoryPath = path.join(
	homeDirectory,
	"Library",
	"Safari",
	"History.db",
);
const safariBookmarksPath = path.join(
	homeDirectory,
	"Library",
	"Safari",
	"Bookmarks.plist",
);
const messagesDatabasePath = path.join(
	homeDirectory,
	"Library",
	"Messages",
	"chat.db",
);

function createFileSystemError(code: NodeJS.ErrnoException["code"]) {
	const error = new Error(code);
	(error as NodeJS.ErrnoException).code = code;
	return error;
}

describe("checkFullDiskAccess", () => {
	it("returns true when the TCC database can be opened", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);
			},
		});

		expect(hasFullDiskAccess).toBe(true);
		expect(openedPaths).toEqual([tccDatabasePath]);
	});

	it("continues past missing optional probe files", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);

				if (filePath !== messagesDatabasePath) {
					throw createFileSystemError("ENOENT");
				}
			},
		});

		expect(hasFullDiskAccess).toBe(true);
		expect(openedPaths).toEqual([
			tccDatabasePath,
			safariHistoryPath,
			safariBookmarksPath,
			messagesDatabasePath,
		]);
	});

	it("continues past missing optional probe directories", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);

				if (filePath !== messagesDatabasePath) {
					throw createFileSystemError("ENOTDIR");
				}
			},
		});

		expect(hasFullDiskAccess).toBe(true);
		expect(openedPaths).toEqual([
			tccDatabasePath,
			safariHistoryPath,
			safariBookmarksPath,
			messagesDatabasePath,
		]);
	});

	it("opens real probe files when using the default read probe", () => {
		const temporaryHomeDirectory = fs.mkdtempSync(
			path.join(tmpdir(), "superset-full-disk-access-"),
		);

		try {
			const realMessagesDatabasePath = path.join(
				temporaryHomeDirectory,
				"Library",
				"Messages",
				"chat.db",
			);

			fs.mkdirSync(path.dirname(realMessagesDatabasePath), { recursive: true });
			fs.writeFileSync(realMessagesDatabasePath, "probe");

			expect(
				checkFullDiskAccess({ homeDirectory: temporaryHomeDirectory }),
			).toBe(true);
		} finally {
			fs.rmSync(temporaryHomeDirectory, { force: true, recursive: true });
		}
	});

	it("returns false when an existing protected file cannot be opened", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);
				throw createFileSystemError("EPERM");
			},
		});

		expect(hasFullDiskAccess).toBe(false);
		expect(openedPaths).toEqual([tccDatabasePath]);
	});

	it("returns false when an existing protected file is not readable", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);
				throw createFileSystemError("EACCES");
			},
		});

		expect(hasFullDiskAccess).toBe(false);
		expect(openedPaths).toEqual([tccDatabasePath]);
	});

	it("returns false when no probe file exists", () => {
		const openedPaths: string[] = [];

		const hasFullDiskAccess = checkFullDiskAccess({
			homeDirectory,
			readProbe: (filePath) => {
				openedPaths.push(filePath);
				throw createFileSystemError("ENOENT");
			},
		});

		expect(hasFullDiskAccess).toBe(false);
		expect(openedPaths).toEqual([
			tccDatabasePath,
			safariHistoryPath,
			safariBookmarksPath,
			messagesDatabasePath,
		]);
	});
});
