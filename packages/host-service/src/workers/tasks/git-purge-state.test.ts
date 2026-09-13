import { describe, expect, mock, test } from "bun:test";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@superset/shared/simple-git-options";
import { gitPurgeStateTask, gitTasks, readGitPurgeState } from "./git.ts";

const input = {
	path: "/repo",
	ref: "refs/heads/feat/shelved",
	checkStatus: false,
	gitEnv: { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C", GIT_CONFIG_COUNT: "0" },
};

type CreateGit = NonNullable<Parameters<typeof readGitPurgeState>[1]>;

function makeGit(result = "0\n", clean = true) {
	const client = {
		env: mock((_env: Record<string, string>): ReturnType<CreateGit> => client),
		status: mock(async () => ({ isClean: () => clean })),
		raw: mock(async (_args: string[]) => result),
	};
	const createGit = mock((..._args: Parameters<CreateGit>) => client);
	return { client, createGit };
}

describe("gitPurgeStateTask", () => {
	test("registers a separate strict task", () => {
		expect(gitPurgeStateTask.type).toBe("git/purgeState");
		expect(gitTasks).toContain(gitPurgeStateTask);
	});

	test("checks the branch without status and preserves environment and absolute timeout policy", async () => {
		const { client, createGit } = makeGit();
		expect(await readGitPurgeState(input, createGit)).toEqual({
			hasChanges: false,
			hasUnpushedCommits: false,
		});
		expect(createGit).toHaveBeenCalledWith(input.path, {
			...USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
			timeout: { block: 15_000, stdOut: false, stdErr: false },
		});
		expect(client.env).toHaveBeenCalledWith(input.gitEnv);
		expect(client.status).not.toHaveBeenCalled();
		expect(client.raw).toHaveBeenCalledWith([
			"rev-list",
			"--count",
			input.ref,
			"--not",
			"--remotes",
			"--",
		]);
	});

	for (const result of ["1\n", "42", " 2 \n"]) {
		test(`counts ${JSON.stringify(result)} as unpushed`, async () => {
			const { createGit } = makeGit(result);
			expect(await readGitPurgeState(input, createGit)).toEqual({
				hasChanges: false,
				hasUnpushedCommits: true,
			});
		});
	}

	for (const result of [
		"",
		" \n",
		"invalid",
		"1junk",
		"-1",
		"+1",
		"1.5",
		"1\n0",
		"NaN",
	]) {
		test(`rejects malformed count ${JSON.stringify(result)}`, async () => {
			const { createGit } = makeGit(result);
			await expect(readGitPurgeState(input, createGit)).rejects.toThrow(
				"Invalid purge commit count",
			);
		});
	}

	for (const clean of [false, true]) {
		for (const unpushed of [false, true]) {
			test(`checks independent HEAD with clean=${clean}, unpushed=${unpushed}`, async () => {
				const { client, createGit } = makeGit(unpushed ? "1" : "0", clean);
				expect(
					await readGitPurgeState(
						{ ...input, ref: "HEAD", checkStatus: true },
						createGit,
					),
				).toEqual({
					hasChanges: !clean,
					hasUnpushedCommits: unpushed,
				});
				expect(client.status).toHaveBeenCalledTimes(1);
				expect(client.raw).toHaveBeenCalledWith([
					"rev-list",
					"--count",
					"HEAD",
					"--not",
					"--remotes",
					"--",
				]);
			});
		}
	}

	for (const ref of [input.ref, "HEAD"]) {
		test(`propagates count errors for ${ref}`, async () => {
			const { client, createGit } = makeGit();
			client.raw.mockRejectedValueOnce(new Error("unreadable Git object"));
			await expect(
				readGitPurgeState(
					{ ...input, ref, checkStatus: ref === "HEAD" },
					createGit,
				),
			).rejects.toThrow("unreadable Git object");
		});
	}

	test("propagates status errors", async () => {
		const { client, createGit } = makeGit();
		client.status.mockRejectedValueOnce(new Error("status failed"));
		await expect(
			readGitPurgeState(
				{ ...input, ref: "HEAD", checkStatus: true },
				createGit,
			),
		).rejects.toThrow("status failed");
		expect(client.raw).not.toHaveBeenCalled();
	});
});
