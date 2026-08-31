import { describe, expect, test } from "bun:test";
import type { SimpleGit } from "simple-git";
import { readWorkspaceRefs } from "./workspace-refs";

describe("readWorkspaceRefs", () => {
	test("reads a self-hosted GitLab upstream from the push ref", async () => {
		const git = {
			raw: async (args: string[]) => {
				if (args[0] === "symbolic-ref") return "alexanderc.smk/29567\n";
				if (args[0] === "rev-parse") {
					return "origin/alexanderc.smk/29567\n";
				}
				throw new Error(`unexpected git raw: ${args.join(" ")}`);
			},
			revparse: async () => "head-sha\n",
			remote: async () => "git@git.smarkets.tech:smarkets/smarkets.git\n",
		} as unknown as SimpleGit;

		await expect(readWorkspaceRefs(git)).resolves.toEqual({
			branch: "alexanderc.smk/29567",
			headSha: "head-sha",
			upstream: {
				owner: "smarkets",
				name: "smarkets",
				branch: "alexanderc.smk/29567",
			},
		});
	});
});
