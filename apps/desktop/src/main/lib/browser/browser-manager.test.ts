import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

interface FakeWebContents extends EventEmitter {
	id: number;
	destroyed: boolean;
	hostWebContents: { id: number } | null;
	isDestroyed: () => boolean;
	setBackgroundThrottling: (enabled: boolean) => void;
	setWindowOpenHandler: (handler: unknown) => void;
}

const wcRegistry = new Map<number, FakeWebContents>();

function fakeWebContents(id: number, hostId: number | null): FakeWebContents {
	const wc = new EventEmitter() as FakeWebContents;
	wc.id = id;
	wc.destroyed = false;
	wc.hostWebContents = hostId === null ? null : { id: hostId };
	wc.isDestroyed = () => wc.destroyed;
	wc.setBackgroundThrottling = () => {};
	wc.setWindowOpenHandler = () => {};
	wcRegistry.set(id, wc);
	return wc;
}

mock.module("electron", () => ({
	webContents: {
		fromId: (id: number) => wcRegistry.get(id),
	},
	clipboard: { writeText: () => {}, writeImage: () => {} },
	Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
}));

mock.module("main/lib/safe-url", () => ({
	safeOpenExternal: async () => {},
}));

const { browserManager } = await import("./browser-manager");

beforeEach(() => {
	browserManager.unregisterAll();
	wcRegistry.clear();
});

describe("register / getWebContents", () => {
	it("resolves a registered pane's webContents", () => {
		const wc = fakeWebContents(1, 100);
		browserManager.register("pane-1", wc.id);
		expect(browserManager.getWebContents("pane-1")).toBe(
			wc as unknown as Electron.WebContents,
		);
	});

	it("returns null for destroyed webContents", () => {
		const wc = fakeWebContents(1, 100);
		browserManager.register("pane-1", wc.id);
		wc.destroyed = true;
		expect(browserManager.getWebContents("pane-1")).toBeNull();
	});

	it("returns null after unregister", () => {
		const wc = fakeWebContents(1, 100);
		browserManager.register("pane-1", wc.id);
		browserManager.unregister("pane-1");
		expect(browserManager.getWebContents("pane-1")).toBeNull();
	});
});

describe("unregisterAllForWindow", () => {
	it("removes only panes hosted in the closing window", () => {
		const inClosing = fakeWebContents(1, 100);
		const inOther = fakeWebContents(2, 200);
		browserManager.register("pane-closing", inClosing.id);
		browserManager.register("pane-other", inOther.id);

		browserManager.unregisterAllForWindow(100);

		expect(browserManager.getWebContents("pane-closing")).toBeNull();
		expect(browserManager.getWebContents("pane-other")).not.toBeNull();
	});

	it("removes panes whose webContents are already destroyed", () => {
		const wc = fakeWebContents(1, 200);
		browserManager.register("pane-1", wc.id);
		wc.destroyed = true;

		browserManager.unregisterAllForWindow(100);

		// Entry is gone even though the host id didn't match: a destroyed wc
		// can't be attributed and would otherwise leak.
		expect(browserManager.getConsoleLogs("pane-1")).toEqual([]);
		expect(browserManager.getWebContents("pane-1")).toBeNull();
	});

	it("removes panes with a null hostWebContents (mid-teardown)", () => {
		const wc = fakeWebContents(1, null);
		browserManager.register("pane-1", wc.id);

		browserManager.unregisterAllForWindow(100);

		expect(browserManager.getWebContents("pane-1")).toBeNull();
	});

	it("removes panes whose webContents id is no longer resolvable", () => {
		const wc = fakeWebContents(1, 100);
		browserManager.register("pane-1", wc.id);
		wcRegistry.delete(wc.id);

		browserManager.unregisterAllForWindow(999);

		expect(browserManager.getWebContents("pane-1")).toBeNull();
	});
});

describe("console capture", () => {
	it("captures console messages per pane and detaches on unregister", () => {
		const wc = fakeWebContents(1, 100);
		browserManager.register("pane-1", wc.id);

		wc.emit("console-message", {}, 2, "boom");
		const logs = browserManager.getConsoleLogs("pane-1");
		expect(logs).toHaveLength(1);
		expect(logs[0]?.level).toBe("error");
		expect(logs[0]?.message).toBe("boom");

		browserManager.unregister("pane-1");
		wc.emit("console-message", {}, 0, "after");
		expect(browserManager.getConsoleLogs("pane-1")).toEqual([]);
	});
});
