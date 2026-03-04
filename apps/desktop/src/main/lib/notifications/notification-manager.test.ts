import { beforeEach, describe, expect, it, mock } from "bun:test";
import type {
	AgentLifecycleEvent,
	NotificationIds,
} from "shared/notification-types";
import {
	type NativeNotification,
	NotificationManager,
	type NotificationManagerDeps,
} from "./notification-manager";

type MockNotification = NativeNotification & {
	handlers: Record<string, (() => void)[]>;
	trigger: (event: string) => void;
};

function createMockNotification(): MockNotification {
	const handlers: Record<string, (() => void)[]> = {};
	return {
		handlers,
		show: mock(() => {}),
		close: mock(() => {}),
		on: mock((event: string, handler: () => void) => {
			handlers[event] ??= [];
			handlers[event].push(handler);
		}),
		trigger(event: string) {
			for (const handler of handlers[event] ?? []) handler();
		},
	};
}

interface TestDeps extends NotificationManagerDeps {
	notifications: MockNotification[];
	clickedIds: NotificationIds[];
}

function createDeps(
	overrides: Partial<NotificationManagerDeps> = {},
): TestDeps {
	const notifications: MockNotification[] = [];
	const clickedIds: NotificationIds[] = [];

	return {
		notifications,
		clickedIds,
		isSupported: () => true,
		createNotification: () => {
			const n = createMockNotification();
			notifications.push(n);
			return n;
		},
		playSound: mock(() => {}),
		onNotificationClick: (ids) => clickedIds.push(ids),
		getVisibilityContext: () => ({
			isFocused: false,
			currentWorkspaceId: null,
			tabsState: undefined,
		}),
		getWorkspaceName: () => "Test Workspace",
		getNotificationTitle: () => "Test Title",
		...overrides,
	};
}

function lastNotification(deps: TestDeps): MockNotification {
	return deps.notifications[deps.notifications.length - 1];
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

describe("NotificationManager", () => {
	let deps: TestDeps;
	let manager: NotificationManager;

	beforeEach(() => {
		deps = createDeps();
		manager = new NotificationManager(deps);
	});

	describe("agent-teams: sub-agent Stop followed by main-agent Start", () => {
		// Regression test for https://github.com/origranot/superset/issues/1785
		//
		// When using Agent Teams, each sub-agent emits a Stop event when it
		// finishes its individual task. The main agent then resumes and emits a
		// Start event for the same pane. Because NotificationManager fires the
		// notification immediately on Stop — before the Start arrives — every
		// sub-agent completion sends an "Agent Complete" notification to the user,
		// even though the overall task is still in progress.
		//
		// The correct behaviour: if a Start follows a Stop for the same pane
		// (indicating the main agent is still running), the Stop notification
		// should be suppressed / cancelled.
		it("does not notify when a Stop is immediately followed by a Start on the same pane", () => {
			// Sub-agent completes → emits Stop for pane-1
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			// Main agent resumes → emits Start for the same pane-1
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);

			// No notification should be visible: the Stop was transient
			expect(manager.activeCount).toBe(0);
		});

		it("does not play sound when a Stop is immediately cancelled by a Start", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);

			expect(deps.playSound).not.toHaveBeenCalled();
		});

		it("still notifies when Stop is NOT followed by a Start (agent genuinely done)", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			// No subsequent Start — agent is truly finished
			expect(manager.activeCount).toBe(1);
		});

		it("only suppresses the pane that resumed, not other panes", () => {
			// pane-1 sub-agent stops but its main agent resumes
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-1" }),
			);
			// pane-2 agent genuinely finishes (no following Start)
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Stop", paneId: "pane-2" }),
			);
			// pane-1 main agent resumes
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "Start", paneId: "pane-1" }),
			);

			// pane-2 should still have a notification; pane-1 should not
			expect(manager.activeCount).toBe(1);
			// And specifically pane-2's notification should have been shown
			expect(deps.notifications.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("handleAgentLifecycle", () => {
		it("ignores Start events", () => {
			manager.handleAgentLifecycle(makeEvent({ eventType: "Start" }));
			expect(manager.activeCount).toBe(0);
		});

		it("shows notification for Stop events", () => {
			manager.handleAgentLifecycle(makeEvent({ eventType: "Stop" }));
			expect(manager.activeCount).toBe(1);
			expect(lastNotification(deps).show).toHaveBeenCalled();
		});

		it("shows notification for PermissionRequest events", () => {
			manager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest" }),
			);
			expect(manager.activeCount).toBe(1);
		});

		it("does not show when isSupported returns false", () => {
			const localDeps = createDeps({ isSupported: () => false });
			const localManager = new NotificationManager(localDeps);
			localManager.handleAgentLifecycle(makeEvent());
			expect(localManager.activeCount).toBe(0);
		});

		it("plays sound on notification", () => {
			manager.handleAgentLifecycle(makeEvent());
			expect(deps.playSound).toHaveBeenCalled();
		});
	});

	describe("tracking and replacement", () => {
		it("replaces notification for the same paneId", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			const first = lastNotification(deps);
			expect(manager.activeCount).toBe(1);

			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			expect(manager.activeCount).toBe(1);
			expect(first.close).toHaveBeenCalled();
		});

		it("tracks different panes independently", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-2" }));
			expect(manager.activeCount).toBe(2);
		});

		it("untracks on click", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			lastNotification(deps).trigger("click");
			expect(manager.activeCount).toBe(0);
		});

		it("untracks on close", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			lastNotification(deps).trigger("close");
			expect(manager.activeCount).toBe(0);
		});

		it("fires onNotificationClick with correct ids on click", () => {
			const event = makeEvent({
				paneId: "p1",
				tabId: "t1",
				workspaceId: "w1",
			});
			manager.handleAgentLifecycle(event);
			lastNotification(deps).trigger("click");
			expect(deps.clickedIds).toEqual([
				{ paneId: "p1", tabId: "t1", workspaceId: "w1" },
			]);
		});

		it("assigns unique keys when paneId is missing", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: undefined }));
			manager.handleAgentLifecycle(makeEvent({ paneId: undefined }));
			expect(manager.activeCount).toBe(2);
		});
	});

	describe("visibility suppression", () => {
		it("suppresses notification when pane is visible and window focused", () => {
			const localDeps = createDeps({
				getVisibilityContext: () => ({
					isFocused: true,
					currentWorkspaceId: "ws-1",
					tabsState: {
						activeTabIds: { "ws-1": "tab-1" },
						focusedPaneIds: { "tab-1": "pane-1" },
					},
				}),
			});
			const localManager = new NotificationManager(localDeps);

			localManager.handleAgentLifecycle(
				makeEvent({
					paneId: "pane-1",
					tabId: "tab-1",
					workspaceId: "ws-1",
				}),
			);
			expect(localManager.activeCount).toBe(0);
		});

		it("does not suppress when window is not focused", () => {
			const localDeps = createDeps({
				getVisibilityContext: () => ({
					isFocused: false,
					currentWorkspaceId: "ws-1",
					tabsState: {
						activeTabIds: { "ws-1": "tab-1" },
						focusedPaneIds: { "tab-1": "pane-1" },
					},
				}),
			});
			const localManager = new NotificationManager(localDeps);

			localManager.handleAgentLifecycle(makeEvent());
			expect(localManager.activeCount).toBe(1);
		});
	});

	describe("dispose", () => {
		it("clears all tracked notifications", () => {
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-1" }));
			manager.handleAgentLifecycle(makeEvent({ paneId: "pane-2" }));
			expect(manager.activeCount).toBe(2);

			manager.dispose();
			expect(manager.activeCount).toBe(0);
		});
	});

	describe("notification content", () => {
		it("uses permission request title/body for PermissionRequest events", () => {
			const createNotification = mock(
				(_opts: { title: string; body: string; silent: boolean }) =>
					createMockNotification(),
			);
			const localDeps = createDeps({ createNotification });
			const localManager = new NotificationManager(localDeps);

			localManager.handleAgentLifecycle(
				makeEvent({ eventType: "PermissionRequest" }),
			);

			expect(createNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Input Needed — Test Workspace",
					body: '"Test Title" needs your attention',
				}),
			);
		});

		it("uses completion title/body for Stop events", () => {
			const createNotification = mock(
				(_opts: { title: string; body: string; silent: boolean }) =>
					createMockNotification(),
			);
			const localDeps = createDeps({ createNotification });
			const localManager = new NotificationManager(localDeps);

			localManager.handleAgentLifecycle(makeEvent({ eventType: "Stop" }));

			expect(createNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Agent Complete — Test Workspace",
					body: '"Test Title" has finished its task',
				}),
			);
		});
	});
});
