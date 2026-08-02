import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { type GitTaskEnv, gitCommitMessageTask } from "./git.ts";

const SUBJECT = "feat(landing): peraga cara kerja pakai contoh marjan";
const BODY = [
	"Contoh Adem diganti marjan. Semua isinya diambil apa adanya.",
	"",
	"  - urutan baris disusun ulang",
	"",
	"Co-Authored-By: Someone <someone@example.com>",
].join("\n");

/** Mirrors what createGitEnvResolver hands the task in production: a plain
 * string map, not a live process env. */
const gitEnv: GitTaskEnv = {
	...(Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	) as GitTaskEnv),
	GIT_OPTIONAL_LOCKS: "0",
};

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	await writeFile(join(path, "README.md"), "test\n");
	await git.raw(["add", "README.md"]);
	await git.raw(["commit", "-m", `${SUBJECT}\n\n${BODY}`]);
	return git;
}

describe("git/getCommitMessage", () => {
	let worktreePath: string;
	let git: SimpleGit;
	let hash: string;

	beforeEach(async () => {
		worktreePath = mkdtempSync(join(tmpdir(), "superset-commit-message-"));
		git = await initRepo(worktreePath);
		hash = (await git.revparse(["HEAD"])).trim();
	});

	afterEach(() => {
		rmSync(worktreePath, { recursive: true, force: true });
	});

	// The gap this task exists to close: listCommits builds its rows from %s,
	// so the body never reaches the renderer no matter how the UI renders it.
	test("the commit list format (%s) carries only the subject", async () => {
		const raw = await git.raw(["log", "-1", "--format=%s"]);

		expect(raw.trim()).toBe(SUBJECT);
		expect(raw).not.toContain("Co-Authored-By");
	});

	test("recovers subject and body from a full hash", async () => {
		const message = await gitCommitMessageTask.handler({
			worktreePath,
			commitHash: hash,
			gitEnv,
		});

		expect(message.subject).toBe(SUBJECT);
		expect(message.body).toBe(BODY);
	});

	test("accepts an abbreviated hash", async () => {
		const shortHash = (await git.revparse(["--short", "HEAD"])).trim();

		const message = await gitCommitMessageTask.handler({
			worktreePath,
			commitHash: shortHash,
			gitEnv,
		});

		expect(message.subject).toBe(SUBJECT);
		expect(message.body).toContain("Co-Authored-By");
	});

	test("rejects refs that are not hex object names", async () => {
		for (const commitHash of ["HEAD", "HEAD~1", "main", "--output=/tmp/x"]) {
			await expect(
				gitCommitMessageTask.handler({ worktreePath, commitHash, gitEnv }),
			).rejects.toThrow("Not a commit hash");
		}
	});
});
