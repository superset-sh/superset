import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { renamedWorktreePath } from "./move-renamed-worktree";

describe("renamedWorktreePath", () => {
	const root = join("/wt", "superset");

	test("swaps the branch segments under the project folder", () => {
		expect(
			renamedWorktreePath(
				join(root, "team", "billowy-hyphen-d7926629"),
				"team/billowy-hyphen-d7926629",
				"team/fix-login-d7926629",
			),
		).toBe(join(root, "team", "fix-login-d7926629"));
	});

	test("leaves the worktree when the rename changes the branch prefix", () => {
		expect(
			renamedWorktreePath(join(root, "billowy"), "billowy", "kiet/fix-login"),
		).toBeNull();
	});

	test("leaves a worktree that is not named after its branch", () => {
		expect(
			renamedWorktreePath(join("/code", "checkout"), "main", "fix-login"),
		).toBeNull();
	});
});
