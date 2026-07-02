import { describe, expect, mock, test } from "bun:test";

// Electron is native and cannot be imported under bun:test. Mock the surface
// menu.ts touches at module load (`app.name`) and the constructors invoked by
// `createApplicationMenu` (unused here — we only exercise the pure template).
mock.module("electron", () => ({
	app: { name: "Superset" },
	BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
	Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
	shell: { openExternal: () => {} },
}));

mock.module("@superset/shared/constants", () => ({
	COMPANY: {
		DOCS_URL: "",
		MAIL_TO: "",
		REPORT_ISSUE_URL: "",
		DISCORD_URL: "",
	},
}));

mock.module("main/env.main", () => ({ env: { NODE_ENV: "production" } }));
mock.module("main/lib/terminal/dev-reset", () => ({
	resetTerminalStateDev: async () => {},
}));
mock.module("./auto-updater", () => ({
	checkForUpdatesInteractive: () => {},
	simulateDownloading: () => {},
	simulateError: () => {},
	simulateUpdateReady: () => {},
}));
mock.module("./menu-events", () => ({ menuEmitter: { emit: () => {} } }));

const { buildMenuTemplate } = await import("./menu");

function findWindowMenu(template: Electron.MenuItemConstructorOptions[]) {
	return template.find((item) => item.label === "Window");
}

describe("application menu — macOS native window tiling (#5273)", () => {
	test("Window menu is designated as the native macOS window menu", () => {
		const template = buildMenuTemplate("darwin", "production");
		const windowMenu = findWindowMenu(template);

		expect(windowMenu).toBeDefined();
		// macOS only injects the tiling commands (Fill, Center, Move & Resize,
		// Full-Screen Tile) into a submenu whose role is "windowMenu". Without it
		// the window does not participate in native tiling — the reported bug.
		expect(windowMenu?.role).toBe("windowMenu");
	});

	test("non-macOS platforms keep the plain Window menu (no role)", () => {
		for (const platform of ["win32", "linux"] as const) {
			const windowMenu = findWindowMenu(
				buildMenuTemplate(platform, "production"),
			);
			expect(windowMenu?.role).toBeUndefined();
		}
	});

	test("custom close accelerator is preserved alongside the role", () => {
		const windowMenu = findWindowMenu(
			buildMenuTemplate("darwin", "production"),
		);
		const submenu = windowMenu?.submenu as
			| Electron.MenuItemConstructorOptions[]
			| undefined;
		const closeItem = submenu?.find((item) => item.role === "close");

		expect(closeItem?.accelerator).toBe("CmdOrCtrl+Shift+Q");
	});
});
