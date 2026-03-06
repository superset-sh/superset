import { describe, expect, test } from "bun:test";
import {
	getWorkspaceAutoRenameDecision,
	resolveWorkspaceAutoRename,
} from "./workspace-auto-rename";

describe("resolveWorkspaceAutoRename", () => {
	test("returns generated name for untouched unnamed workspace", () => {
		expect(
			resolveWorkspaceAutoRename({
				workspace: {
					branch: "feat/test-branch",
					name: "feat/test-branch",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toBe("Fix auth flow");
	});

	test("does not overwrite an already named workspace", () => {
		expect(
			resolveWorkspaceAutoRename({
				workspace: {
					branch: "feat/test-branch",
					name: "Custom name",
					isUnnamed: false,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toBeNull();
	});

	test("does not overwrite placeholder once another name has been applied", () => {
		expect(
			resolveWorkspaceAutoRename({
				workspace: {
					branch: "feat/test-branch",
					name: "Running setup",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "Fix auth flow",
			}),
		).toBeNull();
	});

	test("ignores empty generated names", () => {
		expect(
			resolveWorkspaceAutoRename({
				workspace: {
					branch: "feat/test-branch",
					name: "feat/test-branch",
					isUnnamed: true,
					deletingAt: null,
				},
				generatedName: "   ",
			}),
		).toBeNull();
	});

	test("reports skip reason for already named workspace", () => {
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
		).toEqual({
			kind: "skip",
			reason: "workspace-named",
		});
	});
});
