import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import {
	getAllManagedWindows,
	getFocusedManagedWindow,
	getManagedWindow,
	getManagedWindowByWebContents,
	registerWindow,
	setWorkspaceIdForWindow,
	unregisterWindow,
} from "./manager";

interface FakeWindow extends EventEmitter {
	webContents: { id: number };
	destroyed: boolean;
	focused: boolean;
	isDestroyed: () => boolean;
	isFocused: () => boolean;
}

let nextWcId = 1;

function fakeWindow(): { win: BrowserWindow; fake: FakeWindow } {
	const fake = new EventEmitter() as FakeWindow;
	fake.webContents = { id: nextWcId++ };
	fake.destroyed = false;
	fake.focused = false;
	fake.isDestroyed = () => fake.destroyed;
	fake.isFocused = () => fake.focused;
	return { win: fake as unknown as BrowserWindow, fake };
}

describe("registerWindow", () => {
	it("registers and resolves by id and webContents id", () => {
		const { win, fake } = fakeWindow();
		const managed = registerWindow(win, { workspaceId: "ws-1" });

		expect(getManagedWindow(managed.id)?.window).toBe(win);
		expect(getManagedWindowByWebContents(fake.webContents.id)?.id).toBe(
			managed.id,
		);
		expect(managed.workspaceId).toBe("ws-1");

		unregisterWindow(managed.id);
	});

	it("defaults workspaceId to null", () => {
		const { win } = fakeWindow();
		const managed = registerWindow(win);
		expect(managed.workspaceId).toBeNull();
		unregisterWindow(managed.id);
	});

	it("unregisters automatically on closed event", () => {
		const { win, fake } = fakeWindow();
		const managed = registerWindow(win);

		fake.emit("closed");

		expect(getManagedWindow(managed.id)).toBeUndefined();
		expect(getManagedWindowByWebContents(fake.webContents.id)).toBeUndefined();
	});

	it("unregisters on closed even when webContents is already destroyed", () => {
		const { win, fake } = fakeWindow();
		const managed = registerWindow(win);
		const wcId = fake.webContents.id;

		// Real Electron throws "Object has been destroyed" on any webContents
		// access once the window is destroyed — which is the state inside the
		// "closed" handler.
		fake.destroyed = true;
		Object.defineProperty(fake, "webContents", {
			get() {
				throw new TypeError("Object has been destroyed");
			},
		});

		expect(() => fake.emit("closed")).not.toThrow();
		expect(getManagedWindow(managed.id)).toBeUndefined();
		expect(getManagedWindowByWebContents(wcId)).toBeUndefined();
	});
});

describe("getAllManagedWindows", () => {
	it("excludes destroyed windows", () => {
		const a = fakeWindow();
		const b = fakeWindow();
		const ma = registerWindow(a.win);
		const mb = registerWindow(b.win);

		b.fake.destroyed = true;

		const ids = getAllManagedWindows().map((m) => m.id);
		expect(ids).toContain(ma.id);
		expect(ids).not.toContain(mb.id);

		unregisterWindow(ma.id);
		unregisterWindow(mb.id);
	});
});

describe("getFocusedManagedWindow", () => {
	it("prefers the currently focused window", () => {
		const a = fakeWindow();
		const b = fakeWindow();
		const ma = registerWindow(a.win);
		const mb = registerWindow(b.win);

		b.fake.focused = true;

		expect(getFocusedManagedWindow()?.id).toBe(mb.id);

		unregisterWindow(ma.id);
		unregisterWindow(mb.id);
	});

	it("falls back to the most recently focused window", async () => {
		const a = fakeWindow();
		const b = fakeWindow();
		const ma = registerWindow(a.win);
		const mb = registerWindow(b.win);

		// Bump a's lastFocusedAt past b's registration timestamp.
		await Bun.sleep(2);
		a.fake.emit("focus");

		expect(getFocusedManagedWindow()?.id).toBe(ma.id);

		unregisterWindow(ma.id);
		unregisterWindow(mb.id);
	});

	it("returns undefined when no windows are registered", () => {
		expect(getFocusedManagedWindow()).toBeUndefined();
	});
});

describe("setWorkspaceIdForWindow", () => {
	it("updates the workspace id", () => {
		const { win } = fakeWindow();
		const managed = registerWindow(win);

		setWorkspaceIdForWindow(managed.id, "ws-9");
		expect(getManagedWindow(managed.id)?.workspaceId).toBe("ws-9");

		setWorkspaceIdForWindow(managed.id, null);
		expect(getManagedWindow(managed.id)?.workspaceId).toBeNull();

		unregisterWindow(managed.id);
	});

	it("ignores unknown ids", () => {
		expect(() => setWorkspaceIdForWindow("nope", "ws-1")).not.toThrow();
	});
});
