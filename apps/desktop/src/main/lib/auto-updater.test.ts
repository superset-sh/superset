import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

class FakeAutoUpdater extends EventEmitter {
	autoDownload = false;
	autoInstallOnAppQuit = false;
	disableDifferentialDownload = false;
	allowDowngrade = false;
	setFeedURL = mock(() => {});
	checkForUpdates = mock(() => Promise.resolve(null));
	quitAndInstall = mock(() => {});
}

const fakeAutoUpdater = new FakeAutoUpdater();

mock.module("electron-updater", () => ({
	autoUpdater: fakeAutoUpdater,
}));

mock.module("electron", () => ({
	app: {
		getPath: mock(() => ""),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => ""),
		isPackaged: false,
		isReady: mock(() => true),
		whenReady: mock(() => Promise.resolve()),
	},
	dialog: {
		showMessageBox: mock(() => Promise.resolve({ response: 0 })),
	},
}));

mock.module("main/index", () => ({
	setSkipQuitConfirmation: mock(() => {}),
}));

const autoUpdater = await import("./auto-updater");
const { AUTO_UPDATE_STATUS } = await import("shared/auto-update");

describe("installUpdate", () => {
	beforeEach(() => {
		fakeAutoUpdater.removeAllListeners();
		fakeAutoUpdater.quitAndInstall.mockClear();
		fakeAutoUpdater.checkForUpdates.mockClear();
		fakeAutoUpdater.setFeedURL.mockClear();
		autoUpdater.setupAutoUpdater();
		// The module is a singleton; emit an error to reset isInstalling
		// between tests (the error handler clears it).
		fakeAutoUpdater.emit("error", new Error("reset"));
	});

	test("ignores install requests when no update is ready", () => {
		expect(autoUpdater.getUpdateStatus().status).not.toBe(
			AUTO_UPDATE_STATUS.READY,
		);

		autoUpdater.installUpdate();

		expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
	});

	test("collapses repeat install clicks into a single quitAndInstall call", () => {
		fakeAutoUpdater.emit("update-downloaded", { version: "9.9.9" });
		expect(autoUpdater.getUpdateStatus().status).toBe(AUTO_UPDATE_STATUS.READY);

		autoUpdater.installUpdate();
		autoUpdater.installUpdate();
		autoUpdater.installUpdate();

		expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
	});

	test("clears the in-flight guard when Squirrel surfaces an error", () => {
		fakeAutoUpdater.emit("update-downloaded", { version: "9.9.9" });
		autoUpdater.installUpdate();
		expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);

		fakeAutoUpdater.emit("error", new Error("squirrel failed"));
		fakeAutoUpdater.emit("update-downloaded", { version: "9.9.9" });
		autoUpdater.installUpdate();

		expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
	});
});
