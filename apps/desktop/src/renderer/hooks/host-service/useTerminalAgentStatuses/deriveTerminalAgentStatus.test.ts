import { describe, expect, it } from "bun:test";
import { deriveTerminalAgentStatus } from "./deriveTerminalAgentStatus";

describe("deriveTerminalAgentStatus", () => {
	it("maps Start to working", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Start",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("working");
	});

	it("maps PermissionRequest to permission regardless of seen timestamp", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "PermissionRequest",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("permission");
	});

	it("maps an unseen Stop to review", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 200,
				lastSeenAt: 100,
			}),
		).toBe("review");
	});

	it("maps a never-seen Stop to review", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("review");
	});

	it("maps a seen Stop to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 100,
				lastSeenAt: 100,
			}),
		).toBe("idle");
	});

	it("maps Failed to failed regardless of seen timestamp", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Failed",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("failed");
	});

	it("maps Attached to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Attached",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("idle");
	});

	it("maps unknown event types to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "SomethingNew",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("idle");
	});
});
