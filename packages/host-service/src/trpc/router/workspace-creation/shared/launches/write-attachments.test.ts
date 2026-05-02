import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeAttachmentsToWorktree } from "./write-attachments";

describe("writeAttachmentsToWorktree", () => {
	let worktree: string;

	beforeEach(() => {
		worktree = mkdtempSync(join(tmpdir(), "write-attachments-"));
	});
	afterEach(() => {
		rmSync(worktree, { recursive: true, force: true });
	});

	it("is a no-op for an empty list", () => {
		writeAttachmentsToWorktree(worktree, []);
		expect(existsSync(join(worktree, ".superset/attachments"))).toBe(false);
	});

	it("creates the .superset/attachments dir and writes each file", () => {
		writeAttachmentsToWorktree(worktree, [
			{
				filename: "diff.patch",
				mediaType: "text/x-diff",
				data: new Uint8Array([0x68, 0x69]), // "hi"
			},
			{
				filename: "notes.txt",
				mediaType: "text/plain",
				data: new Uint8Array([0x6f, 0x6b]), // "ok"
			},
		]);

		const dir = join(worktree, ".superset/attachments");
		expect(existsSync(dir)).toBe(true);
		expect(readFileSync(join(dir, "diff.patch"), "utf-8")).toBe("hi");
		expect(readFileSync(join(dir, "notes.txt"), "utf-8")).toBe("ok");
	});

	it("falls back to 'attachment' when filename is undefined", () => {
		writeAttachmentsToWorktree(worktree, [
			{
				mediaType: "application/octet-stream",
				data: new Uint8Array([0x00]),
			},
		]);
		expect(
			existsSync(join(worktree, ".superset/attachments/attachment")),
		).toBe(true);
	});
});
