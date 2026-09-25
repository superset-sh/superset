import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import { diffSideObjectSpec, readDiffSideBlob } from "./diff-side-blob";

describe("diffSideObjectSpec", () => {
	test("mirrors the ref pairs the text diff compares", () => {
		const refs = { originRef: "abc", fromRef: "from", toRef: "to" };
		expect(diffSideObjectSpec("against-base", "old", "a.png", refs)).toBe(
			"abc:a.png",
		);
		expect(diffSideObjectSpec("against-base", "new", "a.png", refs)).toBe(
			"HEAD:a.png",
		);
		expect(diffSideObjectSpec("commit", "old", "a.png", refs)).toBe(
			"from:a.png",
		);
		expect(diffSideObjectSpec("commit", "new", "a.png", refs)).toBe("to:a.png");
		expect(diffSideObjectSpec("staged", "old", "a.png", refs)).toBe(
			"HEAD:a.png",
		);
		expect(diffSideObjectSpec("staged", "new", "a.png", refs)).toBe(":0:a.png");
		expect(diffSideObjectSpec("unstaged", "old", "a.png", refs)).toBe(
			":0:a.png",
		);
	});

	test("the unstaged new side is the working tree, not a git object", () => {
		expect(diffSideObjectSpec("unstaged", "new", "a.png", {})).toBeNull();
	});
});

describe("readDiffSideBlob", () => {
	async function repoWithBinary() {
		const dir = await mkdtemp(join(tmpdir(), "diff-side-blob-"));
		const git = createUserSimpleGit(dir);
		await git.init();
		await git.addConfig("user.email", "t@example.com");
		await git.addConfig("user.name", "t");
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0xff]);
		await writeFile(join(dir, "a.png"), bytes);
		await git.add("a.png");
		await git.commit("add");
		return { git, bytes };
	}

	test("returns the exact bytes of a committed blob", async () => {
		const { git, bytes } = await repoWithBinary();
		const blob = await readDiffSideBlob(git, "HEAD:a.png", 1024);
		expect(blob.kind).toBe("bytes");
		if (blob.kind !== "bytes" || blob.exceededLimit) throw new Error("bytes");
		expect(Buffer.compare(blob.content, bytes)).toBe(0);
		expect(blob.byteLength).toBe(bytes.byteLength);
	});

	test("reports the size without reading a blob over the cap", async () => {
		const { git, bytes } = await repoWithBinary();
		const blob = await readDiffSideBlob(
			git,
			"HEAD:a.png",
			bytes.byteLength - 1,
		);
		expect(blob).toEqual({
			kind: "bytes",
			content: null,
			byteLength: bytes.byteLength,
			exceededLimit: true,
		});
	});

	test("a path absent at the ref is missing, not an error", async () => {
		const { git } = await repoWithBinary();
		expect(await readDiffSideBlob(git, "HEAD:nope.png", 1024)).toEqual({
			kind: "missing",
		});
	});
});
