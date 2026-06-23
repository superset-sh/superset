import { describe, expect, it } from "bun:test";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { shouldRefuseSelection } from "./shouldRefuseSelection";

const region = (
	overrides?: Partial<CapturedEditorSelection>,
): CapturedEditorSelection => ({
	path: "src/a.ts",
	startLine: 40,
	endLine: 60,
	text: "const a = 1;",
	...overrides,
});

describe("shouldRefuseSelection (edge #1 inert + edge #4 refuse-only)", () => {
	it("refuses a null capture (empty/whitespace selection → send() is a no-op)", () => {
		expect(shouldRefuseSelection(null)).toBe(true);
	});

	it("refuses an undefined capture (no editor / no resolvable selection)", () => {
		expect(shouldRefuseSelection(undefined)).toBe(true);
	});

	it("refuses a missing (empty) path so no 'In :L..' anchor is ever emitted (edge #4)", () => {
		expect(shouldRefuseSelection(region({ path: "" }))).toBe(true);
	});

	it("refuses a whitespace-only path (edge #4)", () => {
		expect(shouldRefuseSelection(region({ path: "   " }))).toBe(true);
	});

	it("refuses a non-finite line range so 'In <path>:LNaN' is never emitted (edge #4)", () => {
		expect(shouldRefuseSelection(region({ startLine: Number.NaN }))).toBe(true);
		expect(shouldRefuseSelection(region({ endLine: Number.NaN }))).toBe(true);
	});

	it("proceeds for a fully-resolved region (real path + finite lines)", () => {
		expect(shouldRefuseSelection(region())).toBe(false);
	});

	it("proceeds for a single-line resolved region (startLine === endLine)", () => {
		expect(shouldRefuseSelection(region({ startLine: 12, endLine: 12 }))).toBe(
			false,
		);
	});
});
