import { describe, expect, test } from "bun:test";
import { parseV2ResourceSessions } from "./session-normalization";

describe("parseV2ResourceSessions", () => {
	test("groups valid v2 sessions and normalizes titles", () => {
		const sessions = parseV2ResourceSessions({
			sessions: [
				{
					terminalId: "terminal-1",
					workspaceId: "workspace-1",
					pid: 123,
					title: "  Claude Code  ",
				},
				{
					terminalId: "terminal-2",
					workspaceId: "workspace-1",
					pid: 124,
					title: "   ",
				},
			],
		});

		expect(sessions.get("workspace-1")).toEqual([
			{
				sessionId: "terminal-1",
				paneId: "terminal-1",
				pid: 123,
				title: "Claude Code",
			},
			{
				sessionId: "terminal-2",
				paneId: "terminal-2",
				pid: 124,
				title: null,
			},
		]);
	});

	test("rejects invalid v2 session identifiers and fractional PIDs", () => {
		const sessions = parseV2ResourceSessions({
			sessions: [
				{
					terminalId: "fractional",
					workspaceId: "workspace-1",
					pid: 123.5,
					title: "Fractional",
				},
				{
					terminalId: "zero",
					workspaceId: "workspace-1",
					pid: 0,
					title: "Zero",
				},
				{
					terminalId: "",
					workspaceId: "workspace-1",
					pid: 125,
					title: "Missing terminal",
				},
				{
					terminalId: "missing-workspace",
					workspaceId: "",
					pid: 126,
					title: "Missing workspace",
				},
			],
		});

		expect(sessions.size).toBe(0);
	});
});
