import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { type DockBadgeDeps, DockBadgeManager } from "./dock-badge";

function makeDeps(overrides: Partial<DockBadgeDeps> = {}): DockBadgeDeps {
	return {
		setBadge: mock(() => {}),
		bounce: mock(() => {}),
		isFocused: () => false,
		...overrides,
	};
}

function makeEvent(
	overrides: Partial<AgentLifecycleEvent> = {},
): AgentLifecycleEvent {
	return {
		eventType: "Stop",
		paneId: "pane-1",
		tabId: "tab-1",
		workspaceId: "ws-1",
		...overrides,
	};
}

describe("DockBadgeManager", () => {
	let deps: DockBadgeDeps;
	let manager: DockBadgeManager;

	beforeEach(() => {
		deps = makeDeps();
		manager = new DockBadgeManager(deps);
	});

	describe("badge count", () => {
		it("sets badge to 1 on first PermissionRequest", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			expect(manager.count).toBe(1);
			expect(deps.setBadge).toHaveBeenLastCalledWith("1");
		});

		it("increments badge for different panes", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-2" }),
			);
			expect(manager.count).toBe(2);
			expect(deps.setBadge).toHaveBeenLastCalledWith("2");
		});

		it("does not double-count the same pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			expect(manager.count).toBe(1);
		});

		it("clears badge when Start event resolves a pending pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);
			expect(manager.count).toBe(0);
			expect(deps.setBadge).toHaveBeenLastCalledWith("");
		});

		it("clears badge when Stop event resolves a pending pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			expect(manager.count).toBe(0);
			expect(deps.setBadge).toHaveBeenLastCalledWith("");
		});

		it("decrements badge correctly when one of multiple panes resolves", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-2" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);
			expect(manager.count).toBe(1);
			expect(deps.setBadge).toHaveBeenLastCalledWith("1");
		});

		it("does not call setBadge for Start/Stop on unknown panes", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "unknown" }),
			);
			expect(deps.setBadge).not.toHaveBeenCalled();
		});

		it("uses sessionId as fallback key when paneId is missing", () => {
			manager.handleAgentLifecycle(
				makeEvent({
					eventType: "PermissionRequest",
					paneId: undefined,
					sessionId: "session-1",
				}),
			);
			expect(manager.count).toBe(1);

			manager.handleAgentLifecycle(
				makeEvent({
					eventType: "Stop",
					paneId: undefined,
					sessionId: "session-1",
				}),
			);
			expect(manager.count).toBe(0);
		});

		it("ignores events with neither paneId nor sessionId", () => {
			manager.handleAgentLifecycle(
				makeEvent({
					eventType: "PermissionRequest",
					paneId: undefined,
					sessionId: undefined,
				}),
			);
			expect(manager.count).toBe(0);
			expect(deps.setBadge).not.toHaveBeenCalled();
		});
	});

	describe("dock bounce", () => {
		it("bounces on new PermissionRequest when app is not focused", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			expect(deps.bounce).toHaveBeenCalledTimes(1);
		});

		it("does not bounce when app is focused", () => {
			const focusedDeps = makeDeps({ isFocused: () => true });
			const focusedManager = new DockBadgeManager(focusedDeps);

			focusedManager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			expect(focusedDeps.bounce).not.toHaveBeenCalled();
		});

		it("does not bounce for duplicate PermissionRequest on same pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			expect(deps.bounce).toHaveBeenCalledTimes(1);
		});

		it("bounces again for a different pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-2" }),
			);
			expect(deps.bounce).toHaveBeenCalledTimes(2);
		});

		it("does not bounce on Start or Stop events", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			expect(deps.bounce).not.toHaveBeenCalled();
		});
	});

	describe("clearAll", () => {
		it("clears all pending panes and resets badge", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest", paneId: "pane-2" }),
			);
			expect(manager.count).toBe(2);

			manager.clearAll();
			expect(manager.count).toBe(0);
			expect(deps.setBadge).toHaveBeenLastCalledWith("");
		});

		it("is a no-op when already empty", () => {
			const callCount = (deps.setBadge as ReturnType<typeof mock>).mock.calls
				.length;
			manager.clearAll();
			expect((deps.setBadge as ReturnType<typeof mock>).mock.calls.length).toBe(
				callCount,
			);
		});
	});
});
