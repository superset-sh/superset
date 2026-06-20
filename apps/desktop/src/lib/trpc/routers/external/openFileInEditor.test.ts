import { describe, expect, test } from "bun:test";
import { openFileInEditorInputSchema } from "./schemas";

describe("openFileInEditor input schema — line/column validation", () => {
	describe("valid inputs are accepted", () => {
		test("valid line and column (positive integers) → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 42,
				column: 10,
			});
			expect(result.success).toBe(true);
		});

		test("line=1, column=1 (minimum valid) → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 1,
				column: 1,
			});
			expect(result.success).toBe(true);
		});

		test("line only, no column → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 42,
			});
			expect(result.success).toBe(true);
		});

		test("neither line nor column (both omitted) → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
			});
			expect(result.success).toBe(true);
		});

		test("line undefined, column undefined → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: undefined,
				column: undefined,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("invalid line values are rejected", () => {
		test("line=0 → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 0,
			});
			expect(result.success).toBe(false);
		});

		test("line=-1 (negative) → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: -1,
			});
			expect(result.success).toBe(false);
		});

		test("line=1.5 (fractional) → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 1.5,
			});
			expect(result.success).toBe(false);
		});
	});

	describe("invalid column values are rejected", () => {
		test("column=0 → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: 0,
			});
			expect(result.success).toBe(false);
		});

		test("column=-1 (negative) → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: -1,
			});
			expect(result.success).toBe(false);
		});

		test("column=1.5 (fractional) → rejected", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: 1.5,
			});
			expect(result.success).toBe(false);
		});
	});
});
