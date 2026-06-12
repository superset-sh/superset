import { describe, expect, it } from "bun:test";
import {
	RESTORED_SESSION_CLEAN_EXIT_GRACE_MS,
	shouldAutoCloseTerminalOnCleanExit,
} from "./terminal-exit-policy";

describe("terminal exit policy", () => {
	it("auto-closes a normal clean exit", () => {
		expect(
			shouldAutoCloseTerminalOnCleanExit({
				exitCode: 0,
				isWorkspaceRunPane: false,
				now: 1_000,
			}),
		).toBe(true);
	});

	it("preserves a clean exit during the restored-session grace window", () => {
		expect(
			shouldAutoCloseTerminalOnCleanExit({
				exitCode: 0,
				isWorkspaceRunPane: false,
				preserveUntilMs: 1_000 + RESTORED_SESSION_CLEAN_EXIT_GRACE_MS,
				now: 1_000,
			}),
		).toBe(false);
	});

	it("never auto-closes workspace-run panes", () => {
		expect(
			shouldAutoCloseTerminalOnCleanExit({
				exitCode: 0,
				isWorkspaceRunPane: true,
				now: 1_000,
			}),
		).toBe(false);
	});

	it("never auto-closes non-zero exits", () => {
		expect(
			shouldAutoCloseTerminalOnCleanExit({
				exitCode: 1,
				isWorkspaceRunPane: false,
				now: 1_000,
			}),
		).toBe(false);
	});
});
