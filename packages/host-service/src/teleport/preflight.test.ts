import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitRunner } from "./git-runner";
import { checkDestination, readDestinationBranch } from "./preflight";

let root: string;
let source: string;
let destination: string;

async function git(dir: string, args: string[]): Promise<string> {
	return createGitRunner(dir).run(args);
}

async function commitAll(dir: string, message: string): Promise<string> {
	await git(dir, ["add", "-A"]);
	await git(dir, ["commit", "-q", "-m", message]);
	return git(dir, ["rev-parse", "HEAD"]);
}

beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), "teleport-preflight-"));
	source = join(root, "source");
	destination = join(root, "destination");

	await mkdir(source, { recursive: true });
	await git(source, ["init", "-q", "--initial-branch=main"]);
	await git(source, ["config", "user.email", "test@superset.invalid"]);
	await git(source, ["config", "user.name", "Test"]);
	await git(source, ["config", "commit.gpgsign", "false"]);
	await writeFile(join(source, "file.txt"), "base\n");
	await commitAll(source, "base");
	await git(source, ["branch", "feature"]);

	await git(root, ["clone", "-q", source, destination]);
	await git(destination, ["config", "user.email", "test@superset.invalid"]);
	await git(destination, ["config", "user.name", "Test"]);
	await git(destination, ["config", "commit.gpgsign", "false"]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("readDestinationBranch", () => {
	test("reports the tip and the tips it can offer as prerequisites", async () => {
		const state = await readDestinationBranch(destination, "main");
		expect(state.tip).toBe(await git(destination, ["rev-parse", "HEAD"]));
		expect(state.tips.length).toBeGreaterThan(0);
		expect(state.checkedOutAt).toBe(destination);
	});

	test("reports no tip for a branch it has never had", async () => {
		const state = await readDestinationBranch(destination, "nonexistent");
		expect(state.tip).toBeNull();
		expect(state.checkedOutAt).toBeNull();
	});

	test("finds a branch checked out in a linked worktree", async () => {
		const linked = join(root, "linked");
		await git(destination, ["branch", "feature-local"]);
		await git(destination, ["worktree", "add", "-q", linked, "feature-local"]);

		const state = await readDestinationBranch(destination, "feature-local");
		expect(state.checkedOutAt).toBe(linked);
	});
});

describe("checkDestination", () => {
	test("allows a branch the destination does not have", async () => {
		const refusal = await checkDestination({
			sourceWorktreePath: source,
			branch: "feature",
			destination: { tip: null, checkedOutAt: null, tips: [] },
		});
		expect(refusal).toBeNull();
	});

	test("allows a branch the source is ahead of", async () => {
		const shared = await git(destination, ["rev-parse", "HEAD"]);
		await writeFile(join(source, "file.txt"), "ahead\n");
		await commitAll(source, "source moved ahead");

		const refusal = await checkDestination({
			sourceWorktreePath: source,
			branch: "main",
			destination: { tip: shared, checkedOutAt: null, tips: [] },
		});
		expect(refusal).toBeNull();
	});

	test("refuses when the branch is checked out there", async () => {
		const refusal = await checkDestination({
			sourceWorktreePath: source,
			branch: "main",
			destination: {
				tip: await git(destination, ["rev-parse", "HEAD"]),
				checkedOutAt: destination,
				tips: [],
			},
		});
		expect(refusal).toEqual({
			kind: "branch-checked-out",
			branch: "main",
			path: destination,
		});
	});

	test("refuses when the destination has commits the source lacks", async () => {
		// The case that silently buries work: restoring here would move the
		// branch back to the source's tip and orphan this commit.
		await writeFile(join(destination, "only-there.txt"), "x\n");
		const diverged = await commitAll(destination, "work only on destination");

		const refusal = await checkDestination({
			sourceWorktreePath: source,
			branch: "main",
			destination: { tip: diverged, checkedOutAt: null, tips: [] },
		});
		expect(refusal).toEqual({
			kind: "branch-diverged",
			branch: "main",
			destinationTip: diverged,
		});
	});

	test("refuses when the destination tip is an object the source never had", async () => {
		const refusal = await checkDestination({
			sourceWorktreePath: source,
			branch: "main",
			destination: { tip: "0".repeat(40), checkedOutAt: null, tips: [] },
		});
		expect(refusal?.kind).toBe("branch-diverged");
	});
});
