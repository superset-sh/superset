import { describe, expect, test } from "bun:test";
import { resolveV2OpenInApp } from "./resolveV2OpenInApp";

describe("resolveV2OpenInApp", () => {
	test("uses the project choice when one is set", () => {
		expect(resolveV2OpenInApp("cursor", "vscode")).toBe("cursor");
	});

	test("falls back to the global default editor", () => {
		expect(resolveV2OpenInApp(undefined, "vscode")).toBe("vscode");
	});

	test("falls back to Finder when nothing is set", () => {
		expect(resolveV2OpenInApp(undefined, null)).toBe("finder");
	});
});
