import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

type MenuItem = Electron.MenuItemConstructorOptions;

const capturedTemplates: MenuItem[][] = [];

const Menu = {
	buildFromTemplate: mock((template: MenuItem[]) => {
		capturedTemplates.push(template);
		return { __template: template };
	}),
	setApplicationMenu: mock(() => {}),
};

// Match the shape used by sibling tests (auto-updater.test.ts mocks the same
// modules with these exact surfaces). mock.module registrations leak across
// files in bun's CI runner, so keeping the shapes compatible avoids
// order-dependent breakage in unrelated tests.
mock.module("electron", () => ({
	app: {
		name: "Superset",
		getPath: mock(() => ""),
		getName: mock(() => "Superset"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => ""),
		isPackaged: false,
		isReady: mock(() => true),
		whenReady: mock(() => Promise.resolve()),
	},
	BrowserWindow: {
		getFocusedWindow: mock(() => null),
		getAllWindows: mock(() => []),
	},
	Menu,
	dialog: { showMessageBox: mock(() => Promise.resolve({ response: 0 })) },
	shell: { openExternal: mock(() => {}) },
}));

mock.module("electron-updater", () => ({
	autoUpdater: new EventEmitter(),
}));

mock.module("electron-log/main", () => ({
	default: {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		transports: { file: { level: "info" } },
	},
}));

mock.module("main/index", () => ({
	setSkipQuitConfirmation: mock(() => {}),
}));

mock.module("main/env.main", () => ({
	env: { NODE_ENV: "production" },
}));

mock.module("main/lib/terminal/dev-reset", () => ({
	resetTerminalStateDev: mock(() => Promise.resolve()),
}));

const { createApplicationMenu } = await import("./menu");

function flatten(items: MenuItem[] | undefined): MenuItem[] {
	if (!items) return [];
	const out: MenuItem[] = [];
	for (const item of items) {
		out.push(item);
		if (Array.isArray(item.submenu)) {
			out.push(...flatten(item.submenu as MenuItem[]));
		}
	}
	return out;
}

function normalizeAccelerator(value: unknown): string | null {
	if (typeof value !== "string" || value.length === 0) return null;
	return value
		.toLowerCase()
		.replace(/cmdorctrl/g, "cmd")
		.replace(/\s+/g, "");
}

describe("createApplicationMenu — cmd+w must not be claimed by the native menu (issue #4809)", () => {
	test("no menu item should accelerate to cmd+w (so the renderer CLOSE_PANE hotkey wins)", () => {
		capturedTemplates.length = 0;
		createApplicationMenu();
		expect(capturedTemplates.length).toBe(1);
		const template = capturedTemplates[0];
		const items = flatten(template);

		const offenders: string[] = [];
		for (const item of items) {
			const accel = normalizeAccelerator(item.accelerator);
			if (accel === "cmd+w" || accel === "ctrl+w") {
				offenders.push(
					`explicit accelerator ${String(item.accelerator)} on label=${String(item.label ?? item.role)}`,
				);
				continue;
			}
			// role:'close' without an explicit accelerator inherits Electron's
			// default for the close role: CmdOrCtrl+W. That fires at the OS-menu
			// level and preempts the renderer's CLOSE_PANE hotkey.
			if (item.role === "close" && item.accelerator == null) {
				offenders.push(
					`role:'close' without explicit accelerator on label=${String(item.label ?? "(unnamed)")} — Electron applies the default Cmd+W and it preempts the renderer's CLOSE_PANE hotkey`,
				);
			}
		}

		expect(offenders).toEqual([]);
	});
});
