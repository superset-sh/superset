import { describe, expect, test } from "bun:test";

import { isDesktopProtocol } from "./desktopProtocol";

describe("isDesktopProtocol", () => {
	test("accepts the schemes the desktop registers", () => {
		expect(isDesktopProtocol("superset")).toBe(true);
		expect(isDesktopProtocol("superset-dev")).toBe(true);
		expect(isDesktopProtocol("superset-my-worktree2")).toBe(true);
		expect(isDesktopProtocol("Superset")).toBe(true);
	});

	test("rejects anything that could redirect the token elsewhere", () => {
		expect(isDesktopProtocol("https")).toBe(false);
		expect(isDesktopProtocol("https://attacker.example/?x=")).toBe(false);
		expect(isDesktopProtocol("superset://evil")).toBe(false);
		expect(isDesktopProtocol("superset-")).toBe(false);
		expect(isDesktopProtocol("supersets")).toBe(false);
		expect(isDesktopProtocol("javascript")).toBe(false);
		expect(isDesktopProtocol("")).toBe(false);
	});
});
