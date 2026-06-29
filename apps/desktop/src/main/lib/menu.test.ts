import { beforeEach, describe, expect, mock, test } from "bun:test";

// Capture the template handed to Menu.buildFromTemplate so we can assert on
// the accelerators/roles the application menu registers.
let capturedTemplate: Electron.MenuItemConstructorOptions[] = [];

mock.module("electron", () => ({
	app: {
		name: "Superset",
	},
	BrowserWindow: {
		getFocusedWindow: mock(() => null),
		getAllWindows: mock(() => []),
	},
	Menu: {
		buildFromTemplate: mock(
			(template: Electron.MenuItemConstructorOptions[]) => {
				capturedTemplate = template;
				return { id: "menu" };
			},
		),
		setApplicationMenu: mock(() => {}),
	},
	shell: {
		openExternal: mock(() => Promise.resolve()),
	},
}));

mock.module("main/env.main", () => ({
	env: { NODE_ENV: "production" },
}));

mock.module("main/lib/terminal/dev-reset", () => ({
	resetTerminalStateDev: mock(() => Promise.resolve()),
}));

mock.module("./auto-updater", () => ({
	checkForUpdatesInteractive: mock(() => {}),
	simulateDownloading: mock(() => {}),
	simulateError: mock(() => {}),
	simulateUpdateReady: mock(() => {}),
}));

mock.module("@superset/shared/constants", () => ({
	COMPANY: {
		DOCS_URL: "https://example.com/docs",
		MAIL_TO: "mailto:test@example.com",
		REPORT_ISSUE_URL: "https://example.com/issues",
		DISCORD_URL: "https://example.com/discord",
	},
}));

const { createApplicationMenu } = await import("./menu");

interface FlatItem {
	role?: string;
	accelerator?: string;
}

function flatten(
	items: Electron.MenuItemConstructorOptions[] | undefined,
): FlatItem[] {
	if (!items) return [];
	const out: FlatItem[] = [];
	for (const item of items) {
		out.push({
			role: item.role as string | undefined,
			accelerator: item.accelerator as string | undefined,
		});
		if (Array.isArray(item.submenu)) {
			out.push(...flatten(item.submenu));
		}
	}
	return out;
}

function normalizeAccelerator(accelerator: string | undefined): string {
	return (accelerator ?? "").replace(/\s+/g, "").toLowerCase();
}

describe("createApplicationMenu — Cmd+Shift+R must reach the renderer (#5124)", () => {
	beforeEach(() => {
		capturedTemplate = [];
		createApplicationMenu();
	});

	// `role: "forceReload"` makes Electron register an implicit
	// CmdOrCtrl+Shift+R accelerator at the application-menu level. That fires
	// in the main process and force-reloads the BrowserWindow before the
	// renderer's REOPEN_TAB ("Reopen Closed Tab") hotkey can run. The renderer's
	// `before-input-event` interceptor deliberately skips Shift, so it never
	// suppresses this — the menu always wins.
	test("does not use role: 'forceReload' (carries implicit Cmd+Shift+R)", () => {
		const items = flatten(capturedTemplate);
		const forceReload = items.filter((i) => i.role === "forceReload");
		expect(forceReload).toHaveLength(0);
	});

	test("no menu item registers a CmdOrCtrl+Shift+R accelerator", () => {
		const items = flatten(capturedTemplate);
		const shiftR = items.filter(
			(i) => normalizeAccelerator(i.accelerator) === "cmdorctrl+shift+r",
		);
		expect(shiftR).toHaveLength(0);
	});
});
