import { describe, expect, it } from "bun:test";
import { getEditorDirtyState } from "./getEditorDirtyState";

describe("getEditorDirtyState", () => {
	it("marks the first edit to an empty file as dirty", () => {
		expect(
			getEditorDirtyState({
				nextValue: "hello",
				originalContent: "",
				loadedContent: "",
			}),
		).toEqual({
			isDirty: true,
			normalizedOriginalContent: "",
		});
	});

	it("uses the loaded file content before the baseline ref is hydrated", () => {
		expect(
			getEditorDirtyState({
				nextValue: "",
				originalContent: "",
				loadedContent: "const value = 1;",
			}),
		).toEqual({
			isDirty: true,
			normalizedOriginalContent: "const value = 1;",
		});
	});

	it("compares against the existing baseline after initialization", () => {
		expect(
			getEditorDirtyState({
				nextValue: "const value = 1;",
				originalContent: "const value = 1;",
				loadedContent: "stale",
			}),
		).toEqual({
			isDirty: false,
			normalizedOriginalContent: "const value = 1;",
		});
	});
});
