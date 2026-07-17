import { beforeEach, describe, expect, it, mock } from "bun:test";

interface FakeRuntime {
	terminalId: string;
	terminal: { id: string };
	serializeAddon: { serialize: () => string };
	container: object | null;
}

const disposedRuntimes: Array<{ terminalId: string; clearPersisted: boolean }> =
	[];

mock.module("./terminal-runtime", () => ({
	createRuntime: (terminalId: string): FakeRuntime => ({
		terminalId,
		terminal: { id: terminalId },
		serializeAddon: { serialize: () => "buf" },
		container: null,
	}),
	attachToContainer: (runtime: FakeRuntime, container: object) => {
		runtime.container = container;
	},
	detachFromContainer: (runtime: FakeRuntime) => {
		runtime.container = null;
	},
	disposeRuntime: (
		runtime: FakeRuntime,
		options: { clearPersistedState?: boolean } = {},
	) => {
		disposedRuntimes.push({
			terminalId: runtime.terminalId,
			clearPersisted: options.clearPersistedState ?? true,
		});
	},
	updateRuntimeAppearance: () => {},
}));

mock.module("./terminal-ws-transport", () => ({
	createTransport: () => ({
		connectionState: "disconnected",
		stateListeners: new Set(),
		titleListeners: new Set(),
		logListeners: new Set(),
		logs: [],
	}),
	connect: () => {},
	reconnect: () => {},
	disposeTransport: () => {},
	sendDispose: () => {},
	sendInput: () => {},
	sendResize: () => {},
	clearLogs: () => {},
}));

mock.module("./terminal-link-manager", () => ({
	TerminalLinkManager: class {
		setHandlers() {}
		dispose() {}
	},
}));

const { terminalRuntimeRegistry: registry } = await import(
	"./terminal-runtime-registry"
);

const appearance = {
	theme: {},
	background: "#000",
	fontFamily: "monospace",
	fontSize: 12,
	// biome-ignore lint/suspicious/noExplicitAny: fake appearance for mocked runtime
} as any;

const container = {} as HTMLDivElement;

let nextId = 0;
function uniqueId(label: string): string {
	return `${label}-${++nextId}`;
}

function mountAndPark(id: string) {
	registry.mount(id, container, appearance);
	registry.detach(id);
}

async function flushEvictionTimer() {
	await new Promise((resolve) => setTimeout(resolve, 5));
}

function evictedIds(): string[] {
	return disposedRuntimes.map((d) => d.terminalId);
}

beforeEach(async () => {
	// drain any pending sweep from the previous test, then clear all entries
	await flushEvictionTimer();
	for (const id of registry.getAllTerminalIds()) {
		registry.release(id);
	}
	disposedRuntimes.length = 0;
	registry.setParkedRuntimeCap(2);
});

describe("parked-runtime LRU eviction", () => {
	it("evicts by recency, not insertion order", async () => {
		const [a, b, c] = [uniqueId("a"), uniqueId("b"), uniqueId("c")];
		mountAndPark(a);
		mountAndPark(b);
		await flushEvictionTimer();
		// re-park a: first-inserted but now most recently used
		registry.mount(a, container, appearance);
		registry.detach(a);
		mountAndPark(c);
		await flushEvictionTimer();

		// cap 2: LRU is b (a was refreshed), even though a was inserted first
		expect(evictedIds()).toEqual([b]);
		expect(registry.getTerminal(b)).toBeNull();
		expect(registry.getTerminal(a)).not.toBeNull();
		expect(registry.getTerminal(c)).not.toBeNull();
	});

	it("persists the buffer on eviction instead of clearing it", async () => {
		const ids = [uniqueId("a"), uniqueId("b"), uniqueId("c")];
		for (const id of ids) mountAndPark(id);
		await flushEvictionTimer();

		expect(disposedRuntimes).toEqual([
			{ terminalId: ids[0], clearPersisted: false },
		]);
	});

	it("never evicts attached runtimes even when they exceed the cap", async () => {
		const attached = [uniqueId("a"), uniqueId("b"), uniqueId("c")];
		for (const id of attached) registry.mount(id, container, appearance);
		const parked = uniqueId("p");
		mountAndPark(parked);
		await flushEvictionTimer();

		expect(evictedIds()).toEqual([]);
		for (const id of [...attached, parked]) {
			expect(registry.getTerminal(id)).not.toBeNull();
		}
	});

	it("defers the sweep so a remount in the same tick rescues the runtime", async () => {
		const ids = [uniqueId("a"), uniqueId("b"), uniqueId("c")];
		for (const id of ids) mountAndPark(id);
		// before the timer fires, the LRU terminal is re-mounted (workspace switch)
		registry.mount(ids[0], container, appearance);
		await flushEvictionTimer();

		// the remount brings parked back under the cap: nothing is evicted
		expect(evictedIds()).toEqual([]);
		for (const id of ids) {
			expect(registry.getTerminal(id)).not.toBeNull();
		}
	});

	it("lowering the cap sweeps immediately", async () => {
		registry.setParkedRuntimeCap(3);
		const ids = [uniqueId("a"), uniqueId("b"), uniqueId("c")];
		for (const id of ids) mountAndPark(id);
		await flushEvictionTimer();
		expect(evictedIds()).toEqual([]);

		registry.setParkedRuntimeCap(1);
		await flushEvictionTimer();
		expect(evictedIds()).toEqual([ids[0], ids[1]]);
		expect(registry.getTerminal(ids[2])).not.toBeNull();
	});

	it("ignores invalid cap values", async () => {
		const ids = [uniqueId("a"), uniqueId("b")];
		for (const id of ids) mountAndPark(id);
		registry.setParkedRuntimeCap(0);
		registry.setParkedRuntimeCap(Number.NaN);
		await flushEvictionTimer();

		expect(evictedIds()).toEqual([]);
	});

	it("does not count runtime-less entries toward the cap", async () => {
		// listener-only entries (e.g. a component subscribing pre-mount) have no runtime
		registry.onStateChange(uniqueId("bare"), () => {});
		registry.onStateChange(uniqueId("bare"), () => {});
		const parked = [uniqueId("a"), uniqueId("b")];
		for (const id of parked) mountAndPark(id);
		await flushEvictionTimer();

		expect(evictedIds()).toEqual([]);
	});
});
