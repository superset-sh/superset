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
				sessionId: "s1",
			});
			manager.handleAgentLifecycle(event);
			lastNotification(deps).trigger("click");
			expect(deps.clickedIds).toEqual([
				{ paneId: "p1", tabId: "t1", workspaceId: "w1", sessionId: "s1" },
			]);
		});

		it("replaces notification for the same session when paneId is missing", () => {
			manager.handleAgentLifecycle(
				makeEvent({ paneId: undefined, sessionId: "session-1" }),
			);
			const first = lastNotification(deps);
			expect(manager.activeCount).toBe(1);

			manager.handleAgentLifecycle(
				makeEvent({ paneId: undefined, sessionId: "session-1" }),
			);
			expect(manager.activeCount).toBe(1);
			expect(first.close).toHaveBeenCalled();
		});

		it("replaces a pane-less notification when the same session later resolves a pane", () => {
			manager.handleAgentLifecycle(
				makeEvent({
					eventType: "PermissionRequest",
					paneId: undefined,
					tabId: undefined,
					workspaceId: undefined,
					sessionId: "session-1",
				}),
			);
			const first = lastNotification(deps);

			manager.handleAgentLifecycle(
				makeEvent({
					eventType: "Stop",
					paneId: "pane-1",
					tabId: "tab-1",
					workspaceId: "ws-1",
					sessionId: "session-1",
				}),
			);

			expect(manager.activeCount).toBe(1);
			expect(first.close).toHaveBeenCalled();
		});

		it("ignores stale close events from the replaced notification", () => {
			manager.handleAgentLifecycle(
				makeEvent({ paneId: undefined, sessionId: "session-1" }),
			);
			const first = lastNotification(deps);

			manager.handleAgentLifecycle(
				makeEvent({
					paneId: "pane-1",
					tabId: "tab-1",
					workspaceId: "ws-1",
					sessionId: "session-1",
				}),
			);
			first.trigger("close");

			expect(manager.activeCount).toBe(1);
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
					title: "Awaiting Response — Test Workspace",
					body: '"Test Title" is waiting for your reply',
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
