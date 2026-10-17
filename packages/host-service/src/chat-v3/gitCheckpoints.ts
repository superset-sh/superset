import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ChatCheckpoints, CheckpointTarget } from "@superset/chat-runtime";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "../runtime/git/simple-git";

const GIT_TIMEOUT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 5_000;
const CHECKOUT_BATCH = 200;
const CHECKPOINT_IDENTITY = {
	GIT_AUTHOR_NAME: "Superset",
	GIT_AUTHOR_EMAIL: "checkpoints@superset.sh",
	GIT_COMMITTER_NAME: "Superset",
	GIT_COMMITTER_EMAIL: "checkpoints@superset.sh",
};

export function checkpointRef(sessionId: string): string {
	return `refs/superset/chat-checkpoints/${sessionId}`;
}

function checkpointSubject(itemId: string): string {
	return `checkpoint ${itemId}`;
}

function gitAt(
	cwd: string,
	env?: Record<string, string>,
	abort?: AbortSignal,
): SimpleGit {
	return createUserSimpleGit(cwd, {
		timeout: { block: GIT_TIMEOUT_MS },
		...(abort ? { abort } : {}),
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...env },
	});
}

async function workTreeRoot(cwd: string): Promise<string | null> {
	const root = await gitAt(cwd)
		.raw(["rev-parse", "--show-toplevel"])
		.then((out) => out.trim())
		.catch(() => "");
	return root || null;
}

/**
 * Runs git against a private copy of the index, so the user's staging area,
 * HEAD and branch are never touched. Seeding it from the real index keeps
 * `add -A` cheap: only files whose stat changed are hashed again.
 */
async function withScratchIndex<T>(
	cwd: string,
	run: (git: SimpleGit) => Promise<T>,
	abort?: AbortSignal,
): Promise<T> {
	const realIndex = resolve(
		cwd,
		(await gitAt(cwd).raw(["rev-parse", "--git-path", "index"])).trim(),
	);
	const dir = await mkdtemp(join(tmpdir(), "superset-checkpoint-"));
	const index = join(dir, "index");
	try {
		await copyFile(realIndex, index).catch(() => undefined);
		return await run(
			gitAt(cwd, { ...CHECKPOINT_IDENTITY, GIT_INDEX_FILE: index }, abort),
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function readRef(git: SimpleGit, ref: string): Promise<string | null> {
	const sha = await git
		.raw(["rev-parse", "--verify", "--quiet", ref])
		.then((out) => out.trim())
		.catch(() => "");
	return sha || null;
}

async function snapshot(
	cwd: string,
	sessionId: string,
	subject: string,
	abort?: AbortSignal,
) {
	return withScratchIndex(
		cwd,
		async (git) => {
			await git.raw(["add", "-A"]);
			const tree = (await git.raw(["write-tree"])).trim();
			const ref = checkpointRef(sessionId);
			const parent = await readRef(git, ref);
			const commit = (
				await git.raw([
					"commit-tree",
					tree,
					...(parent ? ["-p", parent] : []),
					"-m",
					subject,
				])
			).trim();
			await git.raw(["update-ref", ref, commit, ...(parent ? [parent] : [])]);
			return tree;
		},
		abort,
	);
}

async function findCheckpoint(
	cwd: string,
	sessionId: string,
	itemId: string,
): Promise<string | null> {
	const log = await gitAt(cwd)
		.raw(["log", "--format=%H %s", checkpointRef(sessionId)])
		.catch(() => "");
	const subject = checkpointSubject(itemId);
	const line = log
		.split("\n")
		.find((entry) => entry.slice(entry.indexOf(" ") + 1) === subject);
	return line ? line.slice(0, line.indexOf(" ")) : null;
}

function parseNameStatus(output: string): { status: string; path: string }[] {
	const fields = output.split("\0").filter(Boolean);
	const entries: { status: string; path: string }[] = [];
	for (let i = 0; i + 1 < fields.length; i += 2) {
		entries.push({ status: fields[i] ?? "", path: fields[i + 1] ?? "" });
	}
	return entries;
}

export function createGitCheckpoints(): ChatCheckpoints {
	return {
		async capture({ cwd: dir, sessionId, itemId }: CheckpointTarget) {
			const cwd = await workTreeRoot(dir);
			if (!cwd) return;
			// A prompt waits on this; a tree too large to snapshot quickly goes without.
			await snapshot(
				cwd,
				sessionId,
				checkpointSubject(itemId),
				AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
			);
		},

		async fork({ cwd: dir, fromSessionId, toSessionId }) {
			const cwd = await workTreeRoot(dir);
			if (!cwd) return;
			const git = gitAt(cwd);
			const head = await readRef(git, checkpointRef(fromSessionId));
			if (head) await git.raw(["update-ref", checkpointRef(toSessionId), head]);
		},

		async restore({ cwd: dir, sessionId, itemId }: CheckpointTarget) {
			const cwd = await workTreeRoot(dir);
			if (!cwd) return "missing";
			const target = await findCheckpoint(cwd, sessionId, itemId);
			if (!target) return "missing";
			// The tree being replaced goes on the same chain, so a rewind can be undone.
			const current = await snapshot(
				cwd,
				sessionId,
				`before rewind to ${itemId}`,
			);
			const changed = parseNameStatus(
				await gitAt(cwd).raw([
					"diff-tree",
					"-r",
					"-z",
					"--no-renames",
					"--name-status",
					`${target}^{tree}`,
					current,
				]),
			);
			await withScratchIndex(cwd, async (git) => {
				await git.raw(["read-tree", `${target}^{tree}`]);
				const restored = changed
					.filter((entry) => entry.status !== "A")
					.map((entry) => entry.path);
				for (let i = 0; i < restored.length; i += CHECKOUT_BATCH) {
					await git.raw([
						"checkout-index",
						"-f",
						"--",
						...restored.slice(i, i + CHECKOUT_BATCH),
					]);
				}
			});
			await Promise.all(
				changed
					.filter((entry) => entry.status === "A")
					.map((entry) => rm(join(cwd, entry.path), { force: true })),
			);
			return "restored";
		},
	};
}
