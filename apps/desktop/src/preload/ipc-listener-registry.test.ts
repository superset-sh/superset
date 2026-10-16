import { describe, expect, test } from "bun:test";
import {
	createIpcListenerRegistry,
	type IpcListener,
} from "./ipc-listener-registry";

/**
 * Minimal stand-in for Electron's `ipcRenderer` that tracks the wrapped
 * listeners registered per channel, mirroring how Electron matches
 * `removeListener` by (channel, function) identity.
 */
function createFakeIpcRenderer() {
	const channels = new Map<string, Set<(...args: unknown[]) => void>>();

	return {
		on(channel: string, listener: (...args: unknown[]) => void) {
			let set = channels.get(channel);
			if (!set) {
				set = new Set();
				channels.set(channel, set);
			}
			set.add(listener);
		},
		removeListener(channel: string, listener: (...args: unknown[]) => void) {
			channels.get(channel)?.delete(listener);
		},
		countFor(channel: string) {
			return channels.get(channel)?.size ?? 0;
		},
		totalCount() {
			let total = 0;
			for (const set of channels.values()) total += set.size;
			return total;
		},
	};
}

describe("createIpcListenerRegistry", () => {
	test("removes the listener it registered on a single channel", () => {
		const ipc = createFakeIpcRenderer();
		const registry = createIpcListenerRegistry(ipc);
		const handler: IpcListener = () => {};

		registry.on("deep-link-navigate", handler);
		expect(ipc.countFor("deep-link-navigate")).toBe(1);

		registry.off("deep-link-navigate", handler);
		expect(ipc.countFor("deep-link-navigate")).toBe(0);
	});

	// Reproduces the leak reported in #5921: the same handler registered on more
	// than one channel must be fully removable. Keyed-by-listener bookkeeping
	// overwrites the first channel's wrapper, so `off` can never remove it.
	test("does not leak when the same handler is used on multiple channels", () => {
		const ipc = createFakeIpcRenderer();
		const registry = createIpcListenerRegistry(ipc);
		const handler: IpcListener = () => {};

		registry.on("channel-a", handler);
		registry.on("channel-b", handler);
		expect(ipc.totalCount()).toBe(2);

		registry.off("channel-a", handler);
		registry.off("channel-b", handler);

		// Every wrapper that was added must be gone; otherwise the wrapped
		// closures (and the persistent V8 handles behind them) accumulate for
		// the life of the renderer.
		expect(ipc.countFor("channel-a")).toBe(0);
		expect(ipc.countFor("channel-b")).toBe(0);
		expect(ipc.totalCount()).toBe(0);
	});

	test("unsubscribing one channel leaves the other intact", () => {
		const ipc = createFakeIpcRenderer();
		const registry = createIpcListenerRegistry(ipc);
		const handler: IpcListener = () => {};

		registry.on("channel-a", handler);
		registry.on("channel-b", handler);

		registry.off("channel-a", handler);
		expect(ipc.countFor("channel-a")).toBe(0);
		expect(ipc.countFor("channel-b")).toBe(1);
	});
});
