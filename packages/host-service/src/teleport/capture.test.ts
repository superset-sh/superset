import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleHandoff, filterToKnownCommits } from "./bundle";
import { captureHandoff } from "./capture";
import { createGitRunner, type GitRunner } from "./git-runner";
import { restoreHandoff } from "./restore";
import { summarizeWorkingTree } from "./working-tree";

/**
 * Real repositories on a real filesystem. Teleport's whole job is getting
 * git plumbing right, so a mocked git would test nothing: these assert that
 * a dirty checkout survives a round trip byte for byte, including the
 * staged/unstaged split that a naive implementation flattens.
 */

const REF = "refs/superset/teleport/test";

let root: string;
let source: string;
let destination: string;

async function git(dir: string, args: string[]): Promise<string> {
	return createGitRunner(dir).run(args);
}

async function initRepo(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	await git(dir, ["init", "-q", "--initial-branch=main"]);
	await git(dir, ["config", "user.email", "test@superset.invalid"]);
	await git(dir, ["config", "user.name", "Test"]);
	await git(dir, ["config", "commit.gpgsign", "false"]);
}

async function commitAll(dir: string, message: string): Promise<string> {
	await git(dir, ["add", "-A"]);
	await git(dir, ["commit", "-q", "-m", message]);
	return git(dir, ["rev-parse", "HEAD"]);
}

beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), "teleport-test-"));
	source = join(root, "source");
	destination = join(root, "destination");

	await initRepo(source);
	await writeFile(join(source, "tracked.txt"), "base\n");
	await writeFile(join(source, ".gitignore"), ".env\nnode_modules/\n");
	await commitAll(source, "base");

	// The destination is a clone, so it shares history — the realistic case,
	// and the one where the bundle should carry almost nothing.
	await git(root, ["clone", "-q", source, destination]);
	await git(destination, ["config", "user.email", "test@superset.invalid"]);
	await git(destination, ["config", "user.name", "Test"]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** Move a capture between two repositories the way a parked transfer would. */
async function transfer(tips: string[] = []): Promise<void> {
	const bundlePath = join(root, "handoff.bundle");
	await bundleHandoff({
		worktreePath: source,
		ref: REF,
		destinationTips: tips,
		outputPath: bundlePath,
	});
	await git(destination, ["fetch", "-q", bundlePath, `${REF}:${REF}`]);
}

describe("captureHandoff", () => {
	test("leaves the source checkout untouched", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		await writeFile(join(source, "new.txt"), "fresh\n");
		await git(source, ["add", "new.txt"]);

		const statusBefore = await git(source, ["status", "--porcelain=v1"]);
		const headBefore = await git(source, ["rev-parse", "HEAD"]);

		await captureHandoff({ worktreePath: source, ref: REF });

		expect(await git(source, ["status", "--porcelain=v1"])).toBe(statusBefore);
		expect(await git(source, ["rev-parse", "HEAD"])).toBe(headBefore);
		expect(await readFile(join(source, "tracked.txt"), "utf8")).toBe(
			"edited\n",
		);
	});

	test("captures on top of HEAD as two commits", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		const capture = await captureHandoff({ worktreePath: source, ref: REF });

		expect(await git(source, ["rev-parse", `${REF}~2`])).toBe(capture.head);
		expect(await git(source, ["rev-parse", `${REF}^`])).toBe(capture.staged);
		expect(await git(source, ["rev-parse", REF])).toBe(capture.working);
	});

	test("names the working tree so an unchanged checkout is recognisable", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		const first = await captureHandoff({ worktreePath: source, ref: REF });
		const again = await captureHandoff({ worktreePath: source, ref: REF });
		expect(again.workingTree).toBe(first.workingTree);

		await writeFile(join(source, "late.txt"), "after the first capture\n");
		const changed = await captureHandoff({ worktreePath: source, ref: REF });
		expect(changed.workingTree).not.toBe(first.workingTree);
	});

	test("carries ignored .env files but not ignored build output", async () => {
		await writeFile(join(source, ".env"), "SECRET=1\n");
		await mkdir(join(source, "node_modules", "left-pad"), {
			recursive: true,
		});
		await writeFile(
			join(source, "node_modules", "left-pad", "index.js"),
			"module.exports = 1;\n",
		);

		const capture = await captureHandoff({ worktreePath: source, ref: REF });
		expect(capture.preciousFiles).toEqual([".env"]);

		const files = await git(source, ["ls-tree", "-r", "--name-only", REF]);
		expect(files).toContain(".env");
		expect(files).not.toContain("node_modules");
	});
});

describe("round trip", () => {
	test("restores modified, untracked, and ignored-precious files", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		await writeFile(join(source, "untracked.txt"), "brand new\n");
		await writeFile(join(source, ".env"), "SECRET=1\n");

		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();
		await restoreHandoff({ worktreePath: destination, ref: REF });

		expect(await readFile(join(destination, "tracked.txt"), "utf8")).toBe(
			"edited\n",
		);
		expect(await readFile(join(destination, "untracked.txt"), "utf8")).toBe(
			"brand new\n",
		);
		expect(await readFile(join(destination, ".env"), "utf8")).toBe(
			"SECRET=1\n",
		);
	});

	test("a second arrival overwrites what the first one left untracked", async () => {
		// The arrival command's git steps, as a sandbox runs them, applied
		// twice: once for the pre-copy, once for the late changes.
		const arrive = async (ref: string) => {
			await git(destination, ["fetch", "-q", "origin", `${ref}:${ref}`]);
			await git(destination, ["checkout", "-q", "-B", "work", `${ref}~2`]);
			await git(destination, ["read-tree", "-u", "--reset", ref]);
			await git(destination, ["read-tree", `${ref}^`]);
			await git(destination, ["update-ref", "-d", ref]);
		};
		await writeFile(join(source, "notes.md"), "first draft\n");
		await captureHandoff({ worktreePath: source, ref: REF });
		await arrive(REF);
		expect(await readFile(join(destination, "notes.md"), "utf8")).toBe(
			"first draft\n",
		);

		await writeFile(join(source, "notes.md"), "first draft\nlate line\n");
		await writeFile(join(source, "tracked.txt"), "edited late\n");
		await captureHandoff({ worktreePath: source, ref: REF });
		await arrive(REF);
		expect(await readFile(join(destination, "notes.md"), "utf8")).toBe(
			"first draft\nlate line\n",
		);
		expect(await readFile(join(destination, "tracked.txt"), "utf8")).toBe(
			"edited late\n",
		);
		expect(await git(destination, ["status", "--porcelain=v1"])).toContain(
			"?? notes.md",
		);
		expect(await git(destination, ["diff", "--name-only"])).toBe("tracked.txt");
		expect(await git(destination, ["diff", "--cached", "--name-only"])).toBe(
			"",
		);
	});

	test("preserves the staged/unstaged split of one file", async () => {
		// The case a single-tree capture silently flattens: half of a file
		// staged, the other half not.
		await writeFile(join(source, "tracked.txt"), "staged\n");
		await git(source, ["add", "tracked.txt"]);
		await writeFile(join(source, "tracked.txt"), "staged then edited\n");

		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();
		await restoreHandoff({ worktreePath: destination, ref: REF });

		expect(await readFile(join(destination, "tracked.txt"), "utf8")).toBe(
			"staged then edited\n",
		);
		// The index holds the staged version, not the working-tree one.
		expect(await git(destination, ["show", ":tracked.txt"])).toBe("staged");
		expect(await git(destination, ["diff", "--cached", "--name-only"])).toBe(
			"tracked.txt",
		);
	});

	test("restores binary content byte for byte", async () => {
		const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 0, 255]);
		await writeFile(join(source, "blob.bin"), bytes);

		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();
		await restoreHandoff({ worktreePath: destination, ref: REF });

		expect(await readFile(join(destination, "blob.bin"))).toEqual(bytes);
	});

	test("carries unpushed commits along with the dirty state", async () => {
		await writeFile(join(source, "tracked.txt"), "committed here\n");
		const unpushed = await commitAll(source, "work only on the source");
		await writeFile(join(source, "tracked.txt"), "and then edited\n");

		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();
		await git(destination, ["checkout", "-q", "-B", "main", unpushed]);
		await restoreHandoff({ worktreePath: destination, ref: REF });

		expect(await git(destination, ["rev-parse", "HEAD"])).toBe(unpushed);
		expect(await readFile(join(destination, "tracked.txt"), "utf8")).toBe(
			"and then edited\n",
		);
	});

	test("refuses to restore onto a different commit", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();

		await writeFile(join(destination, "other.txt"), "diverged\n");
		await commitAll(destination, "destination moved on");

		await expect(
			restoreHandoff({ worktreePath: destination, ref: REF }),
		).rejects.toThrow(/capture was taken at/);
	});

	test("an empty checkout round-trips to an empty checkout", async () => {
		await captureHandoff({ worktreePath: source, ref: REF });
		await transfer();
		await restoreHandoff({ worktreePath: destination, ref: REF });

		expect(await git(destination, ["status", "--porcelain=v1"])).toBe("");
	});
});

describe("bundle prerequisites", () => {
	test("excludes commits the destination already has", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		await captureHandoff({ worktreePath: source, ref: REF });

		const shared = await git(destination, ["rev-parse", "HEAD"]);
		const withPrereq = join(root, "small.bundle");
		const withoutPrereq = join(root, "big.bundle");

		await bundleHandoff({
			worktreePath: source,
			ref: REF,
			destinationTips: [shared],
			outputPath: withPrereq,
		});
		await bundleHandoff({
			worktreePath: source,
			ref: REF,
			destinationTips: [],
			outputPath: withoutPrereq,
		});

		const listed = await git(source, ["bundle", "list-heads", withPrereq]);
		expect(listed).toContain(REF);
		expect(Bun.file(withPrereq).size).toBeLessThan(
			Bun.file(withoutPrereq).size,
		);
	});

	test("ignores tips the source has never seen", async () => {
		await captureHandoff({ worktreePath: source, ref: REF });
		const unknown = "0".repeat(40);

		// Naming an unknown object as a prerequisite would fail the bundle
		// outright, which is how a stale destination ref breaks a teleport.
		await bundleHandoff({
			worktreePath: source,
			ref: REF,
			destinationTips: [unknown],
			outputPath: join(root, "handoff.bundle"),
		});

		await git(destination, [
			"fetch",
			"-q",
			join(root, "handoff.bundle"),
			`${REF}:${REF}`,
		]);
		expect(
			await git(destination, ["rev-parse", `${REF}^{commit}`]),
		).toBeTruthy();
	});

	test("filterToKnownCommits keeps commits and drops the rest", async () => {
		const runner: GitRunner = createGitRunner(source);
		const head = await git(source, ["rev-parse", "HEAD"]);
		const tree = await git(source, ["rev-parse", "HEAD^{tree}"]);

		expect(
			await filterToKnownCommits(runner, [head, tree, "0".repeat(40), "nope"]),
		).toEqual([head]);
	});
});

describe("summarizeWorkingTree", () => {
	test("counts modified, untracked and precious separately", async () => {
		await writeFile(join(source, "tracked.txt"), "edited\n");
		await writeFile(join(source, "untracked.txt"), "new\n");
		await writeFile(join(source, ".env"), "SECRET=1\n");

		const summary = await summarizeWorkingTree(source);
		expect(summary.modified).toBe(1);
		expect(summary.untracked).toBe(1);
		expect(summary.preciousFiles).toBe(1);
	});

	test("counts only commits no remote-tracking ref can reach", async () => {
		// The destination is a clone of the source, so it is the one with a
		// remote. Committing there is the realistic "unpushed work" shape.
		expect((await summarizeWorkingTree(destination)).unpushedCommits).toBe(0);

		await writeFile(join(destination, "local.txt"), "x\n");
		await commitAll(destination, "local work");

		expect((await summarizeWorkingTree(destination)).unpushedCommits).toBe(1);
	});

	test("a repository with no remote reports its whole history", async () => {
		// Correct rather than surprising: nothing here exists anywhere else,
		// so a teleport that dropped it would lose all of it.
		expect((await summarizeWorkingTree(source)).unpushedCommits).toBe(1);
	});

	test("counts a rename once", async () => {
		await git(source, ["mv", "tracked.txt", "renamed.txt"]);
		const summary = await summarizeWorkingTree(source);
		expect(summary.modified).toBe(1);
		expect(summary.untracked).toBe(0);
	});
});
