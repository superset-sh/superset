import { describe, expect, test } from "bun:test";
import { UpdateKeyNotFoundError } from "@tanstack/db";
import {
	describeOptimisticError,
	isMissingCollectionKeyError,
} from "./describeOptimisticError";

const MISSING_WORKSPACE_ID = "1ac891db-6049-4c6b-a9c2-a7e7018f5836";

describe("isMissingCollectionKeyError", () => {
	test("recognizes the tanstack/db UpdateKeyNotFoundError", () => {
		const error = new UpdateKeyNotFoundError(MISSING_WORKSPACE_ID);
		expect(isMissingCollectionKeyError(error)).toBe(true);
	});

	test("returns false for unrelated errors", () => {
		expect(isMissingCollectionKeyError(new Error("network down"))).toBe(false);
		expect(isMissingCollectionKeyError("oops")).toBe(false);
		expect(isMissingCollectionKeyError(null)).toBe(false);
	});
});

describe("describeOptimisticError", () => {
	test("replaces the raw 'object for this key was not found' message for workspaces", () => {
		const error = new UpdateKeyNotFoundError(MISSING_WORKSPACE_ID);

		expect(error.message).toContain(
			"was passed to update but an object for this key was not found in the collection",
		);

		const description = describeOptimisticError(
			"optimistic.v2Workspaces",
			error,
		);

		expect(description).toBe(
			"This workspace no longer exists. It may have been removed elsewhere.",
		);
		expect(description).not.toContain(MISSING_WORKSPACE_ID);
		expect(description).not.toContain("collection");
	});

	test("uses scope-specific messages for projects and tasks", () => {
		const error = new UpdateKeyNotFoundError("missing");
		expect(describeOptimisticError("optimistic.v2Projects", error)).toBe(
			"This project no longer exists. It may have been removed elsewhere.",
		);
		expect(describeOptimisticError("optimistic.tasks", error)).toBe(
			"This task no longer exists. It may have been removed elsewhere.",
		);
	});

	test("falls back to the raw error message for unrelated failures", () => {
		expect(
			describeOptimisticError(
				"optimistic.v2Workspaces",
				new Error("Network request failed"),
			),
		).toBe("Network request failed");
	});

	test("returns a generic rollback message when the error has no useful message", () => {
		expect(describeOptimisticError("optimistic.v2Workspaces", {})).toBe(
			"The local change was rolled back.",
		);
	});
});
