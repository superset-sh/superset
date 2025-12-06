import { app, type BrowserWindow, Menu, shell } from "electron";
import { HELP_MENU } from "shared/constants";
import { checkForUpdatesInteractive } from "./auto-updater";

export function createApplicationMenu(mainWindow: BrowserWindow) {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					label: "New Window",
					accelerator: "CmdOrCtrl+Shift+N",
					click: async () => {},
				},
				{ type: "separator" },
				{ role: "quit" },
			],
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
				{
					label: "Close Window",
					accelerator: "CmdOrCtrl+Shift+W",
					click: () => {
						mainWindow.close();
					},
				},
			],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "Contact Us",
					click: () => {
						shell.openExternal(HELP_MENU.CONTACT_EMAIL);
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
						mainWindow.webContents.send("menu:open-settings", "keyboard");
					},
				},
			],
		},
	];

	// Add About menu on macOS
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
