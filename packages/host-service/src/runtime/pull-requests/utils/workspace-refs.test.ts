import { describe, expect, test } from "bun:test";
import type { SimpleGit } from "simple-git";
import { readWorkspaceRefs } from "./workspace-refs";

describe("readWorkspaceRefs", () => {
	test("reads a self-hosted GitLab upstream from the push ref", async () => {
		const git = {
			raw: async (args: string[]) => {
				if (args[0] === "symbolic-ref") return "feature/self-hosted\n";
				if (args[0] === "rev-parse") {
					return "origin/feature/self-hosted\n";
				}
				throw new Error(`unexpected git raw: ${args.join(" ")}`);
			},
			revparse: async () => "head-sha\n",
			remote: async () => "git@gitlab.example.com:acme/example.git\n",
		} as unknown as SimpleGit;

		await expect(readWorkspaceRefs(git)).resolves.toEqual({
			branch: "feature/self-hosted",
			headSha: "head-sha",
			upstream: {
				provider: "gitlab",
				host: "gitlab.example.com",
				owner: "acme",
				name: "example",
				branch: "feature/self-hosted",
			},
		});
	});
});
