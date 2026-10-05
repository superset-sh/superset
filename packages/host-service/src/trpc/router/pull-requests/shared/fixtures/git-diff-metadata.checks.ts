import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import * as environment from "../../../../../terminal/clean-shell-env";
import * as gh from "../../../workspace-creation/utils/exec-gh";

const env = Object.fromEntries(
	Object.entries(process.env).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	),
);
const commands: string[][] = [];
const removeDirectory = fs.rm;
let gitError: Error | null = null;
const execute = async (_file: string, args: string[]) => {
	commands.push(args);
	if (gitError) throw gitError;
	return { stdout: args.includes("diff") ? "full patch" : "", stderr: "" };
};
mock.module("node:child_process", () => ({
	execFile: Object.assign(execute, { [promisify.custom]: execute }),
}));
const { fetchPullRequestGitDiff } = await import(
	"../fetch-pull-request-git-diff"
);
const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);
const mergeBaseSha = "c".repeat(40);

afterEach(async () => {
	mock.restore();
	gitError = null;
	const directories = new Set(
		commands.flatMap((args) =>
			args
				.filter((arg) => arg.startsWith("--git-dir="))
				.map((arg) => arg.slice("--git-dir=".length)),
		),
	);
	await Promise.all(
		[...directories].map((directory) =>
			removeDirectory(directory, { recursive: true, force: true }),
		),
	);
	commands.length = 0;
});

test("uses the base repository and pinned SHAs for fork PRs and their merge base", async () => {
	const exec = spyOn(gh, "execGh")
		.mockResolvedValueOnce({
			base: { sha: baseSha, ref: "main" },
			head: {
				sha: headSha,
				ref: "fork-branch",
				repo: { full_name: "fork-owner/repo" },
			},
		})
		.mockResolvedValueOnce({ merge_base_commit: { sha: mergeBaseSha } });
	spyOn(environment, "getToolEnvironment").mockResolvedValue(env);
	expect(await fetchPullRequestGitDiff("base-owner/repo", 42)).toBe(
		"full patch",
	);
	expect(exec.mock.calls.map(([args]) => args)).toEqual([
		["api", "repos/base-owner/repo/pulls/42"],
		["api", `repos/base-owner/repo/compare/${baseSha}...${headSha}?per_page=1`],
	]);
	const fetch = commands.find((args) => args.includes("fetch"));
	expect(fetch?.slice(-3)).toEqual([
		"https://github.com/base-owner/repo.git",
		mergeBaseSha,
		headSha,
	]);
	const diff = commands.find((args) => args.includes("diff"));
	expect(diff?.slice(-3)).toEqual([mergeBaseSha, headSha, "--"]);
	const directory = fetch
		?.find((arg) => arg.startsWith("--git-dir="))
		?.slice("--git-dir=".length);
	expect(directory).toBeDefined();
	if (!directory) throw new Error("Git did not receive a temporary directory");
	expect(existsSync(directory)).toBe(false);
});

test.each([
	{ base: { sha: "main" }, head: { sha: headSha } },
	{ base: { sha: baseSha }, head: { sha: "fork-branch" } },
	{ base: { sha: baseSha }, head: null },
])("rejects incomplete or symbolic PR metadata before comparing or fetching", async (metadata) => {
	const exec = spyOn(gh, "execGh").mockResolvedValue(metadata);
	await expect(
		fetchPullRequestGitDiff("base-owner/repo", 42),
	).rejects.toThrow();
	expect(exec).toHaveBeenCalledTimes(1);
	expect(commands).toHaveLength(0);
});

test("rejects an invalid comparison merge base before fetching", async () => {
	spyOn(gh, "execGh")
		.mockResolvedValueOnce({ base: { sha: baseSha }, head: { sha: headSha } })
		.mockResolvedValueOnce({ merge_base_commit: { sha: "main" } });
	await expect(
		fetchPullRequestGitDiff("base-owner/repo", 42),
	).rejects.toThrow();
	expect(commands).toHaveLength(0);
});

test("propagates metadata API failures without starting Git", async () => {
	const error = new Error("GitHub metadata unavailable");
	spyOn(gh, "execGh").mockRejectedValue(error);
	await expect(fetchPullRequestGitDiff("base-owner/repo", 42)).rejects.toBe(
		error,
	);
	expect(commands).toHaveLength(0);
});

test("keeps a successful patch when temporary repository cleanup fails", async () => {
	spyOn(gh, "execGh")
		.mockResolvedValueOnce({ base: { sha: baseSha }, head: { sha: headSha } })
		.mockResolvedValueOnce({ merge_base_commit: { sha: mergeBaseSha } });
	spyOn(environment, "getToolEnvironment").mockResolvedValue(env);
	spyOn(fs, "rm").mockRejectedValue(new Error("cleanup failed"));
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	expect(await fetchPullRequestGitDiff("base-owner/repo", 42)).toBe(
		"full patch",
	);
	expect(warn).toHaveBeenCalledTimes(1);
});

test("keeps the original Git error when temporary repository cleanup also fails", async () => {
	spyOn(gh, "execGh")
		.mockResolvedValueOnce({ base: { sha: baseSha }, head: { sha: headSha } })
		.mockResolvedValueOnce({ merge_base_commit: { sha: mergeBaseSha } });
	spyOn(environment, "getToolEnvironment").mockResolvedValue(env);
	spyOn(fs, "rm").mockRejectedValue(new Error("cleanup failed"));
	spyOn(console, "warn").mockImplementation(() => {});
	gitError = new Error("original Git failure");
	await expect(fetchPullRequestGitDiff("base-owner/repo", 42)).rejects.toBe(
		gitError,
	);
});
