import { describe, expect, it, mock } from "bun:test";
import {
	getGitStatusQueryInput,
	invalidateGitStatusQuery,
} from "./useGitStatus";

describe("useGitStatus helpers", () => {
	it("preserves baseBranch in the git status query key", () => {
		expect(getGitStatusQueryInput("workspace-1", "main")).toEqual({
			workspaceId: "workspace-1",
			baseBranch: "main",
		});
		expect(getGitStatusQueryInput("workspace-1", null)).toEqual({
			workspaceId: "workspace-1",
			baseBranch: undefined,
		});
	});

	it("invalidates git status with the full branch-aware query input", () => {
		const invalidate = mock(async () => undefined);
		const queryInput = getGitStatusQueryInput("workspace-1", "develop");

		invalidateGitStatusQuery(invalidate, queryInput);

		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(invalidate).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			baseBranch: "develop",
		});
	});
});
