import { app, Menu, shell } from "electron";
import { HELP_MENU } from "shared/constants";
import { checkForUpdatesInteractive } from "./auto-updater";
import { menuEmitter } from "./menu-events";

export function createApplicationMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [{ role: "quit" }],
		},
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
				{ role: "reload" },
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
				{ role: "close", accelerator: "CmdOrCtrl+Shift+W" },
			],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "Contact Us",
					click: () => {
						shell.openExternal(HELP_MENU.CONTACT_URL);
					},
				},
				{
					label: "Report Issue",
					click: () => {
						shell.openExternal(HELP_MENU.REPORT_ISSUE_URL);
					},
				},
				{
					label: "Join Discord",
					click: () => {
						shell.openExternal(HELP_MENU.DISCORD_URL);
					},
				},
				{ type: "separator" },
				{
					label: "Keyboard Shortcuts",
					click: () => {
						menuEmitter.emit("open-settings", "keyboard");
					},
				},
			],
		},
	];

	if (process.platform === "darwin") {
		template.unshift({
			label: app.name,
			submenu: [
				{ role: "about" },
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
