import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import type { TerminalLauncher } from "../../../useV2TerminalLauncher";
import { createAddTerminalAction } from "./createAddTerminalAction";

interface DeferredLauncher {
	launcher: TerminalLauncher;
	createCallCount: () => number;
	resolveAll: () => void;
}

function makeDeferredLauncher(): DeferredLauncher {
	let calls = 0;
	const pending: Array<(id: string) => void> = [];
	const launcher: TerminalLauncher = {
		create: () => {
			calls += 1;
			const id = `terminal-${calls}`;
			return new Promise<string>((resolve) => {
				pending.push(() => resolve(id));
			});
		},
	};
	return {
		launcher,
		createCallCount: () => calls,
		resolveAll: () => {
			while (pending.length > 0) {
				pending.shift()?.("");
			}
		},
	};
}

async function flush() {
	for (let i = 0; i < 5; i += 1) {
		await Promise.resolve();
	}
}

describe("createAddTerminalAction", () => {
	test("rapid clicks during a slow launcher.create produce one terminal", async () => {
		const store = createWorkspaceStore<PaneViewerData>();
		const { launcher, createCallCount, resolveAll } = makeDeferredLauncher();
		const addTerminal = createAddTerminalAction({ store, launcher });

		// Simulate three rapid clicks while the first create is still in flight
		// (host-service waits for the OSC 133 shell-ready marker, up to 15s).
		const p1 = addTerminal();
		const p2 = addTerminal();
		const p3 = addTerminal();

		await flush();

		expect(createCallCount()).toBe(1);

		resolveAll();
		await Promise.all([p1, p2, p3]);

		expect(createCallCount()).toBe(1);
		expect(store.getState().tabs).toHaveLength(1);
	});

	test("a click after the previous create resolves spawns a fresh terminal", async () => {
		const store = createWorkspaceStore<PaneViewerData>();
		const { launcher, createCallCount, resolveAll } = makeDeferredLauncher();
		const addTerminal = createAddTerminalAction({ store, launcher });

		const first = addTerminal();
		resolveAll();
		await first;

		const second = addTerminal();
		resolveAll();
		await second;

		expect(createCallCount()).toBe(2);
		expect(store.getState().tabs).toHaveLength(2);
	});
});
