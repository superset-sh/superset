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

export function createApplicationMenu() {
	const reloadAccelerator = "CmdOrCtrl+R";
	const closeAccelerator = "CmdOrCtrl+Shift+Q";
	const showHotkeysAccelerator = "CmdOrCtrl+/";
	const openSettingsAccelerator = "CmdOrCtrl+,";

	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "Edit",
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
			label: "View",
			submenu: [
				{
					label: "Reload",
					accelerator: reloadAccelerator,
					click: () => {
						BrowserWindow.getFocusedWindow()?.reload();
					},
				},
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "close", accelerator: closeAccelerator },
			],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "Documentation",
					click: () => {
						shell.openExternal(COMPANY.DOCS_URL);
					},
				},
				{ type: "separator" },
				{
					label: "Contact Us",
					click: () => {
						shell.openExternal(COMPANY.MAIL_TO);
					},
				},
				{
					label: "Report Issue",
					click: () => {
						shell.openExternal(COMPANY.REPORT_ISSUE_URL);
					},
				},
				{
					label: "Join Discord",
					click: () => {
						shell.openExternal(COMPANY.DISCORD_URL);
					},
				},
				{ type: "separator" },
				{
					label: "Keyboard Shortcuts",
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
					label: "Settings...",
					accelerator: openSettingsAccelerator,
					click: () => {
						menuEmitter.emit("open-settings");
					},
				},
				{
					label: "Check for Updates...",
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
			],
		});
	}

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}
