import { describe, expect, test } from "bun:test";
import type { SimpleGit } from "simple-git";
import { readWorkspaceRefs } from "./workspace-refs";

function gitWithTrackedSshRemote(remoteUrl: string): SimpleGit {
	return {
		raw: async (args: string[]) => {
			const command = args.join(" ");
			if (command === "symbolic-ref --short HEAD") return "feature";
			if (command === "config --get branch.feature.merge")
				return "refs/heads/feature";
			if (command === "config --get branch.feature.remote") return "origin";
			throw new Error("not configured");
		},
		revparse: async () => "abc123",
		remote: async () => remoteUrl,
	} as unknown as SimpleGit;
}

describe("workspace upstream identity", () => {
	test("recognizes an alternate GitLab SSH host only when configured", async () => {
		const git = gitWithTrackedSshRemote(
			"git@ssh.example.com:team/subgroup/repo.git",
		);
		expect(
			await readWorkspaceRefs(
				git,
				["https://code.example.com"],
				[{ sshHost: "ssh.example.com", instance: "https://code.example.com" }],
			),
		).toEqual({
			branch: "feature",
			headSha: "abc123",
			upstream: {
				owner: "team/subgroup",
				name: "repo",
				branch: "feature",
			},
		});
		expect(
			(await readWorkspaceRefs(git, ["https://code.example.com"])).upstream,
		).toBeNull();
	});
});
