import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { app, BrowserWindow, Menu, shell } from "electron";
import { env } from "main/env.main";
import { resetTerminalStateDev } from "main/lib/terminal/dev-reset";
import {
	checkForUpdatesInteractive,
	simulateDownloading,
	simulateError,
	simulateUpdateReady,
} from "./auto-updater";
import { menuEmitter } from "./menu-events";
import { confirmAndQuitCompletely } from "./quit-completely";

export function createApplicationMenu() {
	const reloadAccelerator = "CmdOrCtrl+R";
	const closeAccelerator = "CmdOrCtrl+Shift+Q";
	const showHotkeysAccelerator = "CmdOrCtrl+/";
	const openSettingsAccelerator = "CmdOrCtrl+,";
	// macOS/VS Code convention for New Window. On Windows/Linux Ctrl+Shift+N is
	// already New Workspace, so use Ctrl+Alt+N there.
	const newWindowAccelerator =
		process.platform === "darwin" ? "Cmd+Shift+N" : "Ctrl+Alt+N";

	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: i18n._(msg({ message: "File" })),
			submenu: [
				{
					label: i18n._(
						msg({
							message: "New Window",
						}),
					),
					accelerator: newWindowAccelerator,
					click: () => {
						menuEmitter.emit("new-window");
					},
				},
				{ type: "separator" },
				{
					label: i18n._(
						msg({
							message: "Open Repo...",
						}),
					),
					accelerator: "CmdOrCtrl+O",
					click: () => {
						menuEmitter.emit("open-project");
					},
				},
				{ type: "separator" },
				// Explicit click handler (not `role: "close"`) — `role: "close"` adds
				// an implicit CmdOrCtrl+W accelerator that overrides browser-manager's
				// `before-input-event` interception and closes the window instead of
				// the focused pane.
				{
					label: i18n._(
						msg({
							message: "Close Window",
						}),
					),
					click: () => {
						BrowserWindow.getFocusedWindow()?.close();
					},
				},
			],
		},
		{
			label: i18n._(msg({ message: "Edit" })),
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: i18n._(msg({ message: "View", context: "menu" })),
			submenu: [
				{
					label: i18n._(msg({ message: "Reload" })),
					accelerator: reloadAccelerator,
					click: () => {
						BrowserWindow.getFocusedWindow()?.reload();
					},
				},
				// Explicit click handler (not `role: "forceReload"`) — the role adds
				// an implicit CmdOrCtrl+Shift+R accelerator that prevents the renderer's
				// Reopen Closed Tab shortcut from receiving the event.
				{
					label: i18n._(
						msg({
							message: "Force Reload",
						}),
					),
					click: () => {
						BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache();
					},
				},
				{ role: "toggleDevTools" },
				{ type: "separator" },
				// Display-only accelerators: the renderer owns ZOOM_IN/ZOOM_OUT/
				// ZOOM_RESET so a focused terminal zooms its font and a focused
				// browser pane zooms its page. Registering them here would fire
				// the role (page zoom) before the renderer ever sees the key.
				{ role: "resetZoom", registerAccelerator: false },
				{ role: "zoomIn", registerAccelerator: false },
				{ role: "zoomOut", registerAccelerator: false },
				{ type: "separator" },
				{
					label: i18n._(
						msg({
							message: "Toggle Scripts Bar",
						}),
					),
					click: () => {
						menuEmitter.emit("toggle-presets-bar");
					},
				},
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{
			label: i18n._(msg({ message: "Window" })),
			// macOS appends the list of open windows to a windowMenu-role menu,
			// which is how you switch between platform windows. Without the role
			// the list never appears, so multi-window has no switcher.
			role: process.platform === "darwin" ? "windowMenu" : undefined,
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "close", accelerator: closeAccelerator },
			],
		},
		{
			label: i18n._(msg({ message: "Resources" })),
			submenu: [
				// No accelerator here: on macOS, a menu accelerator is always live
				// and would bypass the renderer's user-customizable CHECK_RESOURCES
				// binding (Settings > Keyboard). The default shortcut stays
				// discoverable via the command palette and keyboard settings, both
				// of which reflect the user's actual current/overridden binding.
				{
					label: i18n._(
						msg({
							message: "Check Resources",
						}),
					),
					click: () => {
						menuEmitter.emit("check-resources");
					},
				},
			],
		},
		{
			label: i18n._(msg({ message: "Help" })),
			submenu: [
				{
					label: i18n._(
						msg({
							message: "Documentation",
						}),
					),
					click: () => {
						shell.openExternal(COMPANY.DOCS_URL);
					},
				},
				{ type: "separator" },
				{
					label: i18n._(
						msg({
							message: "Contact Us",
						}),
					),
					click: () => {
						shell.openExternal(COMPANY.MAIL_TO);
					},
				},
				{
					label: i18n._(
						msg({
							message: "Report Issue",
						}),
					),
					click: () => {
						shell.openExternal(COMPANY.REPORT_ISSUE_URL);
					},
				},
				{
					label: i18n._(
						msg({
							message: "Join Discord",
						}),
					),
					click: () => {
						shell.openExternal(COMPANY.DISCORD_URL);
					},
				},
				{ type: "separator" },
				{
					label: i18n._(
						msg({
							message: "Keyboard Shortcuts",
						}),
					),
					accelerator: showHotkeysAccelerator,
					click: () => {
						menuEmitter.emit("open-settings", "keyboard");
					},
				},
			],
		},
	];

	// DEV ONLY: Add Dev menu
	if (env.NODE_ENV === "development") {
		template.push({
			label: "Dev",
			submenu: [
				{
					label: "Reset Terminal State",
					click: () => {
						resetTerminalStateDev()
							.then(() => {
								for (const window of BrowserWindow.getAllWindows()) {
									window.reload();
								}
							})
							.catch((error) => {
								console.error("[menu] Failed to reset terminal state:", error);
							});
					},
				},
				{ type: "separator" },
				{
					label: "Simulate Update Downloading",
					click: () => simulateDownloading(),
				},
				{
					label: "Simulate Update Ready",
					click: () => simulateUpdateReady(),
				},
				{
					label: "Simulate Update Error",
					click: () => simulateError(),
				},
			],
		});
	}

	if (process.platform === "darwin") {
		template.unshift({
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{
					label: i18n._(
						msg({
							message: "Settings...",
						}),
					),
					accelerator: openSettingsAccelerator,
					click: () => {
						menuEmitter.emit("open-settings");
					},
				},
				{
					label: i18n._(
						msg({
							message: "Check for Updates...",
						}),
					),
					click: () => {
						checkForUpdatesInteractive();
					},
				},
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
				{
					label: i18n._(
						msg({
							message: "Quit Superset Completely",
						}),
					),
					click: () => {
						void confirmAndQuitCompletely();
					},
				},
			],
		});
	}

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}
