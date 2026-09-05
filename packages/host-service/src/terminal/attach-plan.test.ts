import { describe, expect, it } from "bun:test";
import { planTerminalAttach } from "./attach-plan.ts";

const TERMINAL_ID = "term-1";

describe("planTerminalAttach", () => {
	it("dead-ends disposed and exited rows with session-gone", () => {
		for (const status of ["disposed", "exited"]) {
			const plan = planTerminalAttach({
				terminalId: TERMINAL_ID,
				record: { status, originWorkspaceId: "ws-1" },
				requestedWorkspaceId: "ws-1",
			});
			expect(plan.kind).toBe("session-gone");
		}
	});

	it("sends a suspended row straight to the respawn branch", () => {
		// The reaper suspended this session because its workspace was
		// archived; there is no pty to adopt, and the row must NOT read as
		// session-gone or the pane dead-ends after unarchiving.
		expect(
			planTerminalAttach({
				terminalId: TERMINAL_ID,
				record: { status: "suspended", originWorkspaceId: "ws-1" },
				requestedWorkspaceId: "ws-1",
			}),
		).toEqual({ kind: "respawn", workspaceId: "ws-1" });
	});

	it("respawns a suspended row even when no workspace was requested", () => {
		expect(
			planTerminalAttach({
				terminalId: TERMINAL_ID,
				record: { status: "suspended", originWorkspaceId: "ws-1" },
				requestedWorkspaceId: null,
			}),
		).toEqual({ kind: "respawn", workspaceId: "ws-1" });
	});

	it("adopts an active row", () => {
		expect(
			planTerminalAttach({
				terminalId: TERMINAL_ID,
				record: { status: "active", originWorkspaceId: "ws-1" },
				requestedWorkspaceId: "ws-1",
			}),
		).toEqual({ kind: "adopt", workspaceId: "ws-1" });
	});

	it("refuses a row without a workspace", () => {
		const plan = planTerminalAttach({
			terminalId: TERMINAL_ID,
			record: { status: "suspended", originWorkspaceId: null },
			requestedWorkspaceId: "ws-1",
		});
		expect(plan.kind).toBe("error");
	});

	it("refuses a workspace mismatch before deciding adopt vs respawn", () => {
		for (const status of ["active", "suspended"]) {
			const plan = planTerminalAttach({
				terminalId: TERMINAL_ID,
				record: { status, originWorkspaceId: "ws-1" },
				requestedWorkspaceId: "ws-2",
			});
			expect(plan.kind).toBe("error");
		}
	});
});
