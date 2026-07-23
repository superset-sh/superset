import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

// Reproduction for issue #5904: "Can't update from 1.15.0 -> 1.16.1".
// A user on an older stable build reports that "Check for Updates..." does
// nothing and they stay on the old version. The scenario below models a
// realistic sequence: a background check downloads the update (status READY,
// the "restart to install" pill is shown), and then the user reaches for the
// menu's "Check for Updates..." item. That interactive check should NOT throw
// away the ready-to-install update — but it currently resets the state to
// CHECKING and, because electron-updater won't re-download an already-cached
// update, the ready state is stranded so the update can never be installed.

const APP_VERSION = "1.15.0";
const AVAILABLE_VERSION = "1.16.1";

// Controls what the fake electron-updater `checkForUpdates()` resolves to for
// the *next* call, mirroring the real library: once an update is cached it
// still reports the update as available but does not re-emit the lifecycle
// events (`update-available` / `update-downloaded`) again.
let checkResult: Promise<unknown> = Promise.resolve(null);

const fakeAutoUpdater = Object.assign(new EventEmitter(), {
	autoDownload: false,
	autoInstallOnAppQuit: false,
	disableDifferentialDownload: false,
	allowDowngrade: false,
	logger: null as unknown,
	downloadedUpdateHelper: { clear: mock(() => Promise.resolve()) },
	setFeedURL: mock(() => {}),
	quitAndInstall: mock(() => {}),
	checkForUpdates: mock(() => checkResult),
});

const shownDialogs: Array<{ title?: string; message?: string }> = [];

mock.module("electron", () => ({
	app: {
		getVersion: () => APP_VERSION,
		isReady: () => true,
		whenReady: () => Promise.resolve(),
	},
	dialog: {
		showMessageBox: mock((opts: { title?: string; message?: string }) => {
			shownDialogs.push(opts);
			return Promise.resolve({ response: 0 });
		}),
	},
}));

mock.module("electron-log/main", () => ({
	default: {
		info: () => {},
		warn: () => {},
		error: () => {},
		transports: { file: { level: "info" } },
	},
}));

mock.module("electron-updater", () => ({
	autoUpdater: fakeAutoUpdater,
}));

mock.module("main/env.main", () => ({
	env: { NODE_ENV: "test" },
}));

mock.module("main/index", () => ({
	setSkipQuitConfirmation: mock(() => {}),
}));

mock.module("main/lib/app-state", () => ({
	appState: {
		data: {},
		write: () => Promise.resolve(),
	},
}));

mock.module("shared/constants", () => ({
	PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
}));

const {
	setupAutoUpdater,
	checkForUpdatesInteractive,
	getUpdateStatus,
	autoUpdateEmitter,
} = await import("./auto-updater");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterAll(() => {
	mock.restore();
});

describe("checkForUpdatesInteractive with a pending downloaded update", () => {
	beforeEach(() => {
		shownDialogs.length = 0;
		checkResult = Promise.resolve(null);
	});

	test("does not strand a ready-to-install update (issue #5904)", async () => {
		// Register the update lifecycle handlers, then let the initial
		// background check settle.
		setupAutoUpdater();
		await flush();

		// A background check has downloaded the update: it is ready to install.
		fakeAutoUpdater.emit("update-downloaded", { version: AVAILABLE_VERSION });
		expect(getUpdateStatus().status).toBe("ready");

		// The user now clicks "Check for Updates..." from the app menu. The
		// update on disk is still available (electron-updater reports it) but is
		// already cached, so no new lifecycle event is emitted.
		checkResult = Promise.resolve({
			updateInfo: { version: AVAILABLE_VERSION },
		});

		const statuses: string[] = [];
		const record = (e: { status: string }) => statuses.push(e.status);
		autoUpdateEmitter.on("status-changed", record);

		checkForUpdatesInteractive();
		await flush();

		autoUpdateEmitter.off("status-changed", record);

		// The user explicitly asked to update and an update is sitting ready to
		// install, so the app must keep the update actionable — not discard it.
		expect(getUpdateStatus().status).toBe("ready");
		// It must never have bounced through CHECKING (which is what strands it).
		expect(statuses).not.toContain("checking");
		// And it should tell the user the update is ready to install.
		expect(shownDialogs.at(-1)?.title).toBe("Update Ready");
	});

	test("still reports 'up to date' when no newer version is available", async () => {
		setupAutoUpdater();
		await flush();

		// No update available: the feed reports the current version.
		fakeAutoUpdater.emit("update-not-available", { version: APP_VERSION });
		checkResult = Promise.resolve({ updateInfo: { version: APP_VERSION } });

		checkForUpdatesInteractive();
		await flush();

		expect(getUpdateStatus().status).toBe("idle");
		expect(shownDialogs.at(-1)?.title).toBe("No Updates");
	});
});
