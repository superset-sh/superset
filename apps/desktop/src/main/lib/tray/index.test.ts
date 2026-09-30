import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const coordinator = new EventEmitter() as EventEmitter & {
	getActiveOrganizationIds: () => string[];
};
coordinator.getActiveOrganizationIds = () => [];

class FakeTray extends EventEmitter {
	static instances: FakeTray[] = [];
	destroyed = false;
	constructor(public icon: unknown) {
		super();
		FakeTray.instances.push(this);
	}
	setToolTip() {}
	setContextMenu() {}
	destroy() {
		this.destroyed = true;
	}
}

const realFs = await import("node:fs");
mock.module("node:fs", () => ({
	...realFs,
	existsSync: () => true,
}));

mock.module("electron", () => ({
	app: { isPackaged: false, getAppPath: () => "/tmp/tray-test" },
	Menu: { buildFromTemplate: () => ({}) },
	nativeImage: {
		createFromPath: () => ({
			getSize: () => ({ width: 16, height: 16 }),
			isEmpty: () => false,
			resize: function () {
				return this;
			},
			setTemplateImage: () => {},
		}),
	},
	Tray: FakeTray,
}));

mock.module("lib/trpc/routers/auth/utils/auth-functions", () => ({
	loadToken: async () => null,
}));
mock.module("main/env.main", () => ({ env: {} }));
mock.module("main/index", () => ({
	focusMainWindow: () => {},
	quitApp: () => {},
}));
mock.module("main/lib/auto-updater", () => ({
	checkForUpdatesInteractive: () => {},
}));
mock.module("main/lib/host-service-coordinator", () => ({
	getHostServiceCoordinator: () => coordinator,
}));
mock.module("main/lib/menu-events", () => ({
	menuEmitter: new EventEmitter(),
}));
mock.module("main/lib/quit-completely", () => ({
	confirmAndQuitCompletely: async () => {},
}));
mock.module("@superset/i18n", () => ({
	i18n: {
		_: (descriptor: unknown) =>
			typeof descriptor === "string"
				? descriptor
				: ((descriptor as { message?: string }).message ?? "?"),
	},
}));

const realPlatform = process.platform;
const stubDarwin = () =>
	Object.defineProperty(process, "platform", {
		value: "darwin",
		configurable: true,
	});
const restorePlatform = () =>
	Object.defineProperty(process, "platform", {
		value: realPlatform,
		configurable: true,
	});

const { disposeTray, initTray } = await import("./index");

describe("tray status-changed listener", () => {
	beforeEach(() => {
		stubDarwin();
		coordinator.removeAllListeners("status-changed");
		FakeTray.instances = [];
		disposeTray();
		restorePlatform();
		stubDarwin();
	});

	test("toggle cycles leave no stacked listeners", () => {
		initTray();
		disposeTray();
		initTray();
		disposeTray();
		expect(coordinator.listenerCount("status-changed")).toBe(0);
		restorePlatform();
	});

	test("dispose with no tray still clears the listener", () => {
		initTray();
		expect(coordinator.listenerCount("status-changed")).toBe(1);
		disposeTray();
		expect(coordinator.listenerCount("status-changed")).toBe(0);
		expect(FakeTray.instances[0]?.destroyed).toBe(true);
		restorePlatform();
	});
});
