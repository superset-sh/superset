import { describe, expect, it } from "bun:test";

import { extractMergeRef, safeEqual } from "./webhook-utils";

describe("safeEqual", () => {
	it("is true only for identical strings", () => {
		expect(safeEqual("secret-abc", "secret-abc")).toBe(true);
		expect(safeEqual("", "")).toBe(true);
	});

	it("is false for different content or different length", () => {
		expect(safeEqual("secret-abc", "secret-xyz")).toBe(false);
		expect(safeEqual("short", "much-longer-token")).toBe(false);
		expect(safeEqual("token", "")).toBe(false);
	});
});

describe("extractMergeRef", () => {
	it("reads project + iid from a merge_request hook", () => {
		expect(
			extractMergeRef({
				object_kind: "merge_request",
				project: { id: 7 },
				object_attributes: { iid: 12 },
			}),
		).toEqual({ projectId: 7, iid: 12 });
	});

	it("reads iid from merge_request for a pipeline hook attached to an MR", () => {
		expect(
			extractMergeRef({
				object_kind: "pipeline",
				project: { id: 7 },
				merge_request: { iid: 5 },
			}),
		).toEqual({ projectId: 7, iid: 5 });
	});

	it("reads iid from merge_request for a note hook on an MR", () => {
		expect(
			extractMergeRef({
				object_kind: "note",
				project: { id: 7 },
				merge_request: { iid: 9 },
			}),
		).toEqual({ projectId: 7, iid: 9 });
	});

	it("returns null for a pipeline/note not attached to an MR", () => {
		expect(
			extractMergeRef({ object_kind: "pipeline", project: { id: 7 } }),
		).toBeNull();
		expect(
			extractMergeRef({ object_kind: "note", project: { id: 7 } }),
		).toBeNull();
	});

	it("returns null when the project is missing", () => {
		expect(
			extractMergeRef({
				object_kind: "merge_request",
				object_attributes: { iid: 12 },
			}),
		).toBeNull();
	});
});
