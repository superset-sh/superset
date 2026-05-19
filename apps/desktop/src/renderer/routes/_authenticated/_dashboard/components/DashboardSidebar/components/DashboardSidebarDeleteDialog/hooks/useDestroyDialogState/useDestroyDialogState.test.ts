import { describe, expect, test } from "bun:test";
import { getWorkspaceMissingOnHostPreview } from "./getWorkspaceMissingOnHostPreview";

describe("getWorkspaceMissingOnHostPreview", () => {
	test("keeps delete confirmation enabled for missing host workspace state", () => {
		expect(getWorkspaceMissingOnHostPreview()).toEqual({
			canDelete: true,
			reason: null,
			hasChanges: false,
			hasUnpushedCommits: false,
		});
	});
});
