import { describe, expect, it } from "bun:test";
import {
	getAutomationRunLinkConsumeKey,
	resolveAutomationRunLinkTarget,
	terminalSessionBelongsToWorkspace,
} from "./useConsumeAutomationRunLink";

describe("getAutomationRunLinkConsumeKey", () => {
	it("dedupes plain automation links by source id", () => {
		expect(
			getAutomationRunLinkConsumeKey({
				type: "terminal",
				id: "terminal-1",
				focusRequestId: undefined,
			}),
		).toBe("terminal:terminal-1");
	});

	it("treats each notification focus request as a fresh command", () => {
		expect(
			getAutomationRunLinkConsumeKey({
				type: "terminal",
				id: "terminal-1",
				focusRequestId: "request-1",
			}),
		).toBe("terminal:terminal-1:focus:request-1");
		expect(
			getAutomationRunLinkConsumeKey({
				type: "terminal",
				id: "terminal-1",
				focusRequestId: "request-2",
			}),
		).toBe("terminal:terminal-1:focus:request-2");
	});
});

describe("automation run link ownership checks", () => {
	it("accepts terminal sessions only from the current workspace", () => {
		const sessions = [
			{ terminalId: "terminal-a", workspaceId: "workspace-a" },
			{ terminalId: "terminal-b", workspaceId: "workspace-b" },
		];

		expect(
			terminalSessionBelongsToWorkspace({
				sessions,
				terminalId: "terminal-a",
				workspaceId: "workspace-a",
			}),
		).toBe(true);
		expect(
			terminalSessionBelongsToWorkspace({
				sessions,
				terminalId: "terminal-a",
				workspaceId: "workspace-b",
			}),
		).toBe(false);
	});
});

describe("resolveAutomationRunLinkTarget", () => {
	it("opens the linked terminal while it is alive", () => {
		expect(
			resolveAutomationRunLinkTarget({
				terminalId: "terminal-a",
				linkedTerminalIsLive: true,
				successor: undefined,
			}),
		).toBe("terminal-a");
	});

	it("follows a restarted agent to the terminal its session moved into", () => {
		expect(
			resolveAutomationRunLinkTarget({
				terminalId: "terminal-a",
				linkedTerminalIsLive: false,
				successor: "terminal-b",
			}),
		).toBe("terminal-b");
	});

	it("waits for the successor lookup, then gives up on a dead link", () => {
		expect(
			resolveAutomationRunLinkTarget({
				terminalId: "terminal-a",
				linkedTerminalIsLive: false,
				successor: undefined,
			}),
		).toBeUndefined();
		expect(
			resolveAutomationRunLinkTarget({
				terminalId: "terminal-a",
				linkedTerminalIsLive: false,
				successor: null,
			}),
		).toBeNull();
	});
});
