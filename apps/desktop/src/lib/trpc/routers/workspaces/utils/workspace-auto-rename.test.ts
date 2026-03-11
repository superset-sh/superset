import { describe, expect, test } from "bun:test";
import { getWorkspaceAutoRenameDecision } from "./workspace-auto-rename";

describe("getWorkspaceAutoRenameDecision", () => {
	test("returns rename for untouched unnamed workspace", () => {
		expect(
			getWorkspaceAutoRenameDecision({
				workspace: {
					branch: "feat/test-branch",
					name: "feat/test-branch",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toEqual({ kind: "rename", name: "Fix auth flow" });
	});

	test("skips an already named workspace", () => {
		expect(
			getWorkspaceAutoRenameDecision({
				workspace: {
					branch: "feat/test-branch",
					name: "Custom name",
					isUnnamed: false,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toEqual({ kind: "skip", reason: "workspace-named" });
	});

	test("renames a transient unnamed placeholder", () => {
		expect(
			getWorkspaceAutoRenameDecision({
				workspace: {
					branch: "feat/test-branch",
					name: "Running setup",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toEqual({ kind: "rename", name: "Fix auth flow" });
	});

	test("skips empty generated names", () => {
		expect(
			getWorkspaceAutoRenameDecision({
				workspace: {
					branch: "feat/test-branch",
					name: "feat/test-branch",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "   ",
			}),
		).toEqual({ kind: "skip", reason: "empty-generated-name" });
	});
});
