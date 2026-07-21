import { describe, expect, it } from "bun:test";
import { terminalAgentStatus } from "./status";

describe("terminalAgentStatus", () => {
	it.each([
		["Start", "working"],
		["PermissionRequest", "permission"],
		["Stop", "idle"],
		["Attached", "idle"],
		["Failed", "failed"],
	] as const)("maps %s to %s", (lastEventType, expected) => {
		expect(terminalAgentStatus({ lastEventType })).toBe(expected);
	});
});
