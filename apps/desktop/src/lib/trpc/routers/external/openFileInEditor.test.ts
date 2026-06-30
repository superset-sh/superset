import { describe, expect, test } from "bun:test";
import { openFileInEditorInputSchema } from "./schemas";

describe("openFileInEditor input schema — line/column coordinate handling", () => {
	describe("valid positive integers pass through unchanged", () => {
		test("valid line and column (positive integers) → success with values preserved", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 42,
				column: 10,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBe(42);
				expect(result.data.column).toBe(10);
			}
		});

		test("line=1, column=1 (minimum valid) → success with values preserved", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 1,
				column: 1,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBe(1);
				expect(result.data.column).toBe(1);
			}
		});

		test("line only, no column → success", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 42,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBe(42);
				expect(result.data.column).toBeUndefined();
			}
		});

		test("neither line nor column (both omitted) → success, both undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBeUndefined();
				expect(result.data.column).toBeUndefined();
			}
		});

		test("line undefined, column undefined → success, both undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: undefined,
				column: undefined,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBeUndefined();
				expect(result.data.column).toBeUndefined();
			}
		});
	});

	// Invalid coordinates must NOT throw — parsing succeeds and the bad coordinate is
	// dropped to undefined so the file still opens (just without line/column jumping).
	describe("invalid line values are silently dropped (not rejected)", () => {
		test("line=0 → parse succeeds, line dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 0,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBeUndefined();
			}
		});

		test("line=-1 (negative) → parse succeeds, line dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: -1,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBeUndefined();
			}
		});

		test("line=1.5 (fractional) → parse succeeds, line dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 1.5,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.line).toBeUndefined();
			}
		});
	});

	describe("invalid column values are silently dropped (not rejected)", () => {
		test("column=0 → parse succeeds, column dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: 0,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.column).toBeUndefined();
			}
		});

		test("column=-1 (negative) → parse succeeds, column dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: -1,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.column).toBeUndefined();
			}
		});

		test("column=1.5 (fractional) → parse succeeds, column dropped to undefined", () => {
			const result = openFileInEditorInputSchema.safeParse({
				path: "/some/file.ts",
				line: 10,
				column: 1.5,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.column).toBeUndefined();
			}
		});
	});
});
