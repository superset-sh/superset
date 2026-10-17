import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import { checkpointRef, createGitCheckpoints } from "./gitCheckpoints";

describe("createGitCheckpoints", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-checkpoints-"));
		git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repo, ".gitignore"), "ignored.txt\n");
		await writeFile(join(repo, "tracked.txt"), "committed\n");
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "init"]);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("restores the tree from before a prompt without touching index or HEAD", async () => {
		const checkpoints = createGitCheckpoints();
		const target = { cwd: repo, sessionId: "session-1", itemId: "item-1" };
		await writeFile(join(repo, "tracked.txt"), "edited before prompt\n");
		await writeFile(join(repo, "untracked.txt"), "kept\n");
		const head = await git.revparse(["HEAD"]);

		await checkpoints.capture(target);
		await writeFile(join(repo, "tracked.txt"), "agent edit\n");
		await writeFile(join(repo, "untracked.txt"), "agent edit\n");
		await writeFile(join(repo, "created.txt"), "agent created\n");
		await writeFile(join(repo, "ignored.txt"), "agent ignored\n");

		expect(await checkpoints.restore(target)).toBe("restored");
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe(
			"edited before prompt\n",
		);
		expect(await readFile(join(repo, "untracked.txt"), "utf8")).toBe("kept\n");
		expect(existsSync(join(repo, "created.txt"))).toBe(false);
		expect(await readFile(join(repo, "ignored.txt"), "utf8")).toBe(
			"agent ignored\n",
		);
		expect(await git.revparse(["HEAD"])).toBe(head);
		expect((await git.status()).staged).toEqual([]);
		const chain = await git.raw([
			"log",
			"--format=%s",
			checkpointRef("session-1"),
		]);
		expect(chain).toContain("before rewind to item-1");
		expect(await checkpoints.restore({ ...target, itemId: "unknown" })).toBe(
			"missing",
		);

		await checkpoints.fork?.({
			cwd: repo,
			fromSessionId: "session-1",
			toSessionId: "session-2",
		});
		await writeFile(join(repo, "tracked.txt"), "after fork\n");
		expect(
			await checkpoints.restore({ ...target, sessionId: "session-2" }),
		).toBe("restored");
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe(
			"edited before prompt\n",
		);
	});
});
