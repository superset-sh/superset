import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SupersetPluginApi } from "@superset/plugin-sdk";

const exec = promisify(execFile);

const DIFF_CAP_BYTES = 200 * 1024;
const MAX_UNTRACKED_DIFFS = 10;

interface WorkspaceReview {
	id: string;
	name: string;
	branch: string;
	filesChanged: number;
	insertions: number;
	deletions: number;
	untracked: number;
}

async function git(
	worktreePath: string,
	args: string[],
	options: { timeout?: number; maxBuffer?: number } = {},
): Promise<string> {
	const { stdout } = await exec("git", ["-C", worktreePath, ...args], {
		timeout: options.timeout ?? 5_000,
		maxBuffer: options.maxBuffer ?? 1024 * 1024,
	});
	return stdout;
}

function parseShortstat(shortstat: string): {
	filesChanged: number;
	insertions: number;
	deletions: number;
} {
	const files = /(\d+) files? changed/.exec(shortstat);
	const ins = /(\d+) insertions?\(\+\)/.exec(shortstat);
	const del = /(\d+) deletions?\(-\)/.exec(shortstat);
	return {
		filesChanged: files ? Number(files[1]) : 0,
		insertions: ins ? Number(ins[1]) : 0,
		deletions: del ? Number(del[1]) : 0,
	};
}

function untrackedFiles(porcelain: string): string[] {
	return porcelain
		.split("\n")
		.filter((line) => line.startsWith("??"))
		.map((line) => line.slice(3).trim())
		.filter(Boolean);
}

export default async function plugin(api: SupersetPluginApi) {
	api.actions.register("list", async () => {
		const workspaces = await api.workspaces.list();
		const reviews: WorkspaceReview[] = [];

		for (const workspace of workspaces) {
			if (workspace.type === "session") continue;
			try {
				const [shortstat, porcelain] = await Promise.all([
					git(workspace.worktreePath, ["diff", "--shortstat", "HEAD"]),
					git(workspace.worktreePath, ["status", "--porcelain"]),
				]);
				const review: WorkspaceReview = {
					id: workspace.id,
					name: workspace.name,
					branch: workspace.branch,
					...parseShortstat(shortstat),
					untracked: untrackedFiles(porcelain).length,
				};
				if (review.filesChanged > 0 || review.untracked > 0) {
					reviews.push(review);
				}
			} catch (error) {
				api.log("skipping workspace with failing git", {
					workspaceId: workspace.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		reviews.sort(
			(a, b) =>
				b.insertions +
				b.deletions +
				b.untracked -
				(a.insertions + a.deletions + a.untracked),
		);
		return { workspaces: reviews };
	});

	api.actions.register("diff", async (params) => {
		const { workspaceId } = (params ?? {}) as { workspaceId?: string };
		if (!workspaceId) throw new Error("workspaceId is required");

		const workspaces = await api.workspaces.list();
		const workspace = workspaces.find((w) => w.id === workspaceId);
		if (!workspace) throw new Error(`unknown workspace "${workspaceId}"`);

		let diff = await git(workspace.worktreePath, ["diff", "HEAD"], {
			timeout: 10_000,
			maxBuffer: 5 * 1024 * 1024,
		});

		const porcelain = await git(workspace.worktreePath, [
			"status",
			"--porcelain",
		]);
		for (const file of untrackedFiles(porcelain).slice(
			0,
			MAX_UNTRACKED_DIFFS,
		)) {
			if (diff.length >= DIFF_CAP_BYTES) break;
			try {
				// diff --no-index exits 1 when files differ; capture stdout anyway.
				diff += await git(
					workspace.worktreePath,
					["diff", "--no-index", "/dev/null", file],
					{ timeout: 10_000, maxBuffer: 5 * 1024 * 1024 },
				);
			} catch (error) {
				const stdout = (error as { stdout?: string }).stdout;
				if (stdout) diff += stdout;
			}
		}

		if (diff.length > DIFF_CAP_BYTES) {
			diff = `${diff.slice(0, DIFF_CAP_BYTES)}\n… diff truncated at 200KB …\n`;
		}
		return { diff };
	});
}
