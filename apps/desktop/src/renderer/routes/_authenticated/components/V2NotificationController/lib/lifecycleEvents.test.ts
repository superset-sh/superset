import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PlayRingtoneOptions } from "renderer/lib/ringtones/play";
import { DEFAULT_RINGTONE_ID } from "shared/ringtones";

const playRingtone = mock((_options: PlayRingtoneOptions) => Promise.resolve());
const showNative = mock((_input: unknown) => Promise.resolve());

mock.module("renderer/lib/ringtones/play", () => ({ playRingtone }));
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		notifications: { showNative: { mutate: showNative } },
		settings: {
			getSelectedRingtoneId: {
				query: () => Promise.resolve(DEFAULT_RINGTONE_ID),
			},
		},
	},
}));

const { handleV2AgentLifecycleEvent } = await import("./lifecycleEvents");

describe("handleV2AgentLifecycleEvent", () => {
	beforeEach(() => {
		playRingtone.mockClear();
		showNative.mockClear();
	});

	it("suppresses Stop notifications for a visible focused pane", () => {
		const hasFocus = Object.getOwnPropertyDescriptor(document, "hasFocus");
		const location = Object.getOwnPropertyDescriptor(window, "location");
		Object.defineProperty(document, "hasFocus", {
			configurable: true,
			value: () => true,
		});
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { hash: "#/v2-workspace/workspace-1" },
		});
		try {
			handleV2AgentLifecycleEvent({
				workspaceId: "workspace-1",
				workspaceName: "Background work",
				volume: 50,
				muted: false,
				payload: {
					terminalId: "terminal-1",
					eventType: "Stop",
					occurredAt: 100,
				},
				paneLayout: {
					version: 1,
					activeTabId: "tab-1",
					tabs: [
						{
							id: "tab-1",
							createdAt: 1,
							activePaneId: "pane-1",
							layout: { type: "pane", paneId: "pane-1" },
							panes: {
								"pane-1": {
									id: "pane-1",
									kind: "terminal",
									data: { terminalId: "terminal-1" },
								},
							},
						},
					],
				},
			});
			expect(playRingtone).not.toHaveBeenCalled();
			expect(showNative).not.toHaveBeenCalled();
		} finally {
			if (location) Object.defineProperty(window, "location", location);
			else Reflect.deleteProperty(window, "location");
			if (hasFocus) Object.defineProperty(document, "hasFocus", hasFocus);
			else Reflect.deleteProperty(document, "hasFocus");
		}
	});

	it("does not notify for Start and notifies once for Stop", () => {
		const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
		Object.defineProperty(document, "hidden", {
			configurable: true,
			value: true,
		});
		try {
			const options = {
				workspaceId: "workspace-1",
				workspaceName: "Background work",
				paneLayout: null,
				volume: 50,
				muted: false,
			};
			const payload = {
				terminalId: "terminal-1",
				occurredAt: 100,
			};

			handleV2AgentLifecycleEvent({
				...options,
				payload: { ...payload, eventType: "Start" },
			});
			expect(playRingtone).not.toHaveBeenCalled();
			expect(showNative).not.toHaveBeenCalled();

			handleV2AgentLifecycleEvent({
				...options,
				payload: { ...payload, eventType: "Stop", occurredAt: 200 },
			});
			expect(playRingtone).toHaveBeenCalledTimes(1);
			expect(playRingtone).toHaveBeenCalledWith({
				ringtoneId: DEFAULT_RINGTONE_ID,
				volume: 50,
				muted: false,
			});
			expect(showNative).toHaveBeenCalledTimes(1);
			expect(showNative).toHaveBeenCalledWith({
				title: "Background work",
				subtitle: "Agent · Finished",
				body: "Open workspace",
				silent: true,
				clickTarget: {
					workspaceId: "workspace-1",
					source: { type: "terminal", id: "terminal-1" },
				},
			});
		} finally {
			if (hidden) Object.defineProperty(document, "hidden", hidden);
			else Reflect.deleteProperty(document, "hidden");
		}
	});
});
