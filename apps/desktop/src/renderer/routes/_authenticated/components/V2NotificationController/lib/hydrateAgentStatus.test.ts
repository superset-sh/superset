import { beforeEach, describe, expect, it } from "bun:test";
import {
	selectV2WorkspaceNotificationStatus,
	useV2NotificationStore,
} from "renderer/stores/v2-notifications";
import {
	deriveV2HydrationUpdates,
	deriveV2StatusFromLifecycleEventType,
} from "./hydrateAgentStatus";

const REMOTE_WORKSPACE_ID = "remote-workspace-1";

function resetStore() {
	useV2NotificationStore.setState({ sources: {} });
}

beforeEach(() => {
	resetStore();
});

describe("deriveV2StatusFromLifecycleEventType", () => {
	it("maps an in-flight agent to working", () => {
		expect(deriveV2StatusFromLifecycleEventType("Start")).toBe("working");
	});

	it("maps a blocked agent to permission", () => {
		expect(deriveV2StatusFromLifecycleEventType("PermissionRequest")).toBe(
			"permission",
		);
	});

	it("does not re-surface acknowledged completions or idle bindings", () => {
		// Stop is a past completion (may already be acknowledged) and Attached is
		// bound-but-idle — neither describes an agent that is currently running.
		expect(deriveV2StatusFromLifecycleEventType("Stop")).toBeNull();
		expect(deriveV2StatusFromLifecycleEventType("Attached")).toBeNull();
		expect(deriveV2StatusFromLifecycleEventType("anything-else")).toBeNull();
	});
});

describe("remote workspace activity indicator (issue #5113)", () => {
	// Reproduces the bug: a Claude Code agent is actively working on a remote
	// host. It emitted its `Start` lifecycle event *before* the desktop's relay
	// event-bus subscription came online, so the desktop never received that
	// live event. The v2 notification store — the sole source of the sidebar
	// activity indicator (`useV2WorkspaceNotificationStatus`) — is therefore
	// empty, and the sidebar shows a static, non-animated icon.
	it("leaves the sidebar status empty without snapshot hydration", () => {
		const status = selectV2WorkspaceNotificationStatus(REMOTE_WORKSPACE_ID)(
			useV2NotificationStore.getState(),
		);
		// Bug: even though the remote agent is working, there is no status, so the
		// icon never animates.
		expect(status).toBeNull();
	});

	// The fix: when the host subscription connects, hydrate the store from the
	// host's current agent bindings (`terminalAgents.listByWorkspace`), whose
	// `lastEventType` reflects the still-running agent.
	it("surfaces the working status by hydrating from the host binding snapshot", () => {
		const bindings = [
			{
				terminalId: "remote-terminal-1",
				lastEventType: "Start",
				lastEventAt: 1_000,
			},
		];

		const updates = deriveV2HydrationUpdates({
			bindings,
			existingSources: useV2NotificationStore.getState().sources,
		});

		const store = useV2NotificationStore.getState();
		for (const update of updates) {
			store.setSourceStatus(
				update.source,
				REMOTE_WORKSPACE_ID,
				update.status,
				update.occurredAt,
			);
		}

		const status = selectV2WorkspaceNotificationStatus(REMOTE_WORKSPACE_ID)(
			useV2NotificationStore.getState(),
		);
		// Fixed: the sidebar now reflects the active remote agent.
		expect(status).toBe("working");
	});

	it("does not clobber a fresher live status already in the store", () => {
		const store = useV2NotificationStore.getState();
		// A live PermissionRequest event arrived for this terminal before the
		// hydration query resolved.
		store.setTerminalStatus(
			"remote-terminal-1",
			REMOTE_WORKSPACE_ID,
			"permission",
			2_000,
		);

		const updates = deriveV2HydrationUpdates({
			bindings: [
				{
					terminalId: "remote-terminal-1",
					lastEventType: "Start",
					lastEventAt: 1_000,
				},
			],
			existingSources: useV2NotificationStore.getState().sources,
		});

		expect(updates).toHaveLength(0);
		const status = selectV2WorkspaceNotificationStatus(REMOTE_WORKSPACE_ID)(
			useV2NotificationStore.getState(),
		);
		expect(status).toBe("permission");
	});
});
