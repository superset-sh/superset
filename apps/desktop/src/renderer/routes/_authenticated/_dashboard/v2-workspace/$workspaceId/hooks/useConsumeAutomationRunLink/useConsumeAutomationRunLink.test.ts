import { describe, expect, it } from "bun:test";
import {
	chatSessionBelongsToWorkspace,
	getAutomationRunLinkConsumeKey,
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
		expect(
			getAutomationRunLinkConsumeKey({
				type: "chat",
				id: "chat-1",
				focusRequestId: undefined,
			}),
		).toBe("chat:chat-1");
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

	it("accepts chat sessions only from the current v2 workspace", () => {
		expect(
			chatSessionBelongsToWorkspace({
				chatSession: { v2WorkspaceId: "workspace-a" },
				workspaceId: "workspace-a",
			}),
		).toBe(true);
		expect(
			chatSessionBelongsToWorkspace({
				chatSession: { v2WorkspaceId: "workspace-a" },
				workspaceId: "workspace-b",
			}),
		).toBe(false);
		expect(
			chatSessionBelongsToWorkspace({
				chatSession: null,
				workspaceId: "workspace-a",
			}),
		).toBe(false);
		expect(
			chatSessionBelongsToWorkspace({
				chatSession: { v2WorkspaceId: null },
				workspaceId: "workspace-a",
			}),
		).toBe(false);
	});
});
