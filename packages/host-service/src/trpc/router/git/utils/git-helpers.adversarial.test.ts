import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangedFile } from "../types";
import { countUntrackedFileLines } from "./git-helpers";

function untracked(path: string): ChangedFile {
	return { path, status: "untracked", additions: null, deletions: null };
}

describe("countUntrackedFileLines edge cases", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "superset-count-adv-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("empty, CRLF-only, no-trailing-newline, single newline", async () => {
		await writeFile(join(root, "empty.txt"), "");
		await writeFile(join(root, "crlf.txt"), "\r\n");
		await writeFile(join(root, "notrail.txt"), "a\nb");
		await writeFile(join(root, "onlynl.txt"), "\n");
		await writeFile(join(root, "cr-only.txt"), "a\rb\rc");
		const files = [
			untracked("empty.txt"),
			untracked("crlf.txt"),
			untracked("notrail.txt"),
			untracked("onlynl.txt"),
			untracked("cr-only.txt"),
		];
		await countUntrackedFileLines(root, files);
		expect(files.map((f) => [f.path, f.additions, f.deletions])).toEqual([
			["empty.txt", 0, 0],
			["crlf.txt", 1, 0],
			["notrail.txt", 2, 0],
			["onlynl.txt", 1, 0],
			["cr-only.txt", 1, 0],
		]);
	});

	test("symlink outside the worktree, FIFO, directory and a vanished file stay null", async () => {
		await symlink("/etc/hosts", join(root, "outside.link"));
		execFileSync("mkfifo", [join(root, "pipe")]);
		await mkdir(join(root, "dir"));
		const files = [
			untracked("outside.link"),
			untracked("pipe"),
			untracked("dir"),
			untracked("gone.txt"),
			untracked("../escape.txt"),
		];
		const started = performance.now();
		await countUntrackedFileLines(root, files);
		expect(performance.now() - started).toBeLessThan(2_000);
		for (const file of files) {
			expect([file.path, file.additions, file.deletions]).toEqual([
				file.path,
				null,
				null,
			]);
		}
	}, 10_000);

	test("a symlink inside the worktree counts its target", async () => {
		await writeFile(join(root, "target.txt"), "1\n2\n3\n");
		await symlink("target.txt", join(root, "inside.link"));
		const files = [untracked("inside.link")];
		await countUntrackedFileLines(root, files);
		expect([files[0]?.additions, files[0]?.deletions]).toEqual([3, 0]);
	});

	test("over the 1 MB budget stays null; a binary is 0/0 flagged", async () => {
		await writeFile(join(root, "big.txt"), "x\n".repeat(600_000));
		await writeFile(join(root, "bin.dat"), Buffer.from([1, 2, 0, 3]));
		await writeFile(join(root, "photo.png"), "not really a png\n");
		const files = [
			untracked("big.txt"),
			untracked("bin.dat"),
			untracked("photo.png"),
		];
		await countUntrackedFileLines(root, files);
		expect(
			files.map((f) => [f.path, f.additions, f.deletions, f.isBinary]),
		).toEqual([
			["big.txt", null, null, undefined],
			["bin.dat", 0, 0, true],
			["photo.png", 0, 0, true],
		]);
	});

	test("a NUL after the 8 KB sniff window is still counted as text", async () => {
		const body = Buffer.concat([
			Buffer.from("a\n".repeat(5_000)),
			Buffer.from([0x00, 0x0a]),
		]);
		await writeFile(join(root, "late-nul.txt"), body);
		const files = [untracked("late-nul.txt")];
		await countUntrackedFileLines(root, files);
		expect([files[0]?.additions, files[0]?.isBinary]).toEqual([
			5_001,
			undefined,
		]);
	});
});
