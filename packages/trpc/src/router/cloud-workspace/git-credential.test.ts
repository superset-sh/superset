import { describe, expect, test } from "bun:test";
import { pushRefusal } from "./git-credential";

describe("pushRefusal", () => {
	test("a workspace on the default branch may push it", () => {
		expect(
			pushRefusal({
				target: "main",
				workspaceBranch: "main",
				defaultBranch: "main",
			}),
		).toBeNull();
	});

	test("a workspace on a feature branch may push its own branch", () => {
		expect(
			pushRefusal({
				target: "feat/x",
				workspaceBranch: "feat/x",
				defaultBranch: "main",
			}),
		).toBeNull();
	});

	test("a workspace on the default branch may push a new feature branch", () => {
		// The normal flow: agent on main cuts feat/x and pushes it.
		expect(
			pushRefusal({
				target: "feat/x",
				workspaceBranch: "main",
				defaultBranch: "main",
			}),
		).toBeNull();
	});

	test("a workspace on a feature branch may NOT push the default branch", () => {
		// The one that hurts: a prompt-injected agent on feat/x pushing main.
		expect(
			pushRefusal({
				target: "main",
				workspaceBranch: "feat/x",
				defaultBranch: "main",
			}),
		).toMatch(/may not push to main/);
	});

	test("with no known default branch, nothing is refused", () => {
		expect(
			pushRefusal({
				target: "main",
				workspaceBranch: "feat/x",
				defaultBranch: undefined,
			}),
		).toBeNull();
	});
});
