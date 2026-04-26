import { describe, expect, it } from "bun:test";
import { getAutomationRunLinkConsumeKey } from "./useConsumeAutomationRunLink";

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
