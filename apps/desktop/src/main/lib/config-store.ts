import Store from "electron-store";
import path from "node:path";
import os from "node:os";
import type { ConfigSchema } from "shared/electron-store";

// Main process only - electron-store instance
export const electronStore = new Store<ConfigSchema>({
	name: "config",
	cwd: path.join(os.homedir(), ".superset"),
	watch: true, // Auto-reload when file changes externally
	defaults: {
		workspaces: [],
		lastWorkspaceId: null,
		tabGroupTemplates: [
			// Default template for new users
			{
				id: "default-2x2",
				name: "Default (2x2)",
				rows: 2,
				cols: 2,
				tabs: [
					{ name: "Terminal 1", command: null, row: 0, col: 0 },
					{ name: "Terminal 2", command: null, row: 0, col: 1 },
					{ name: "Terminal 3", command: null, row: 1, col: 0 },
					{ name: "Terminal 4", command: null, row: 1, col: 1 },
				],
			},
		],
	},
});
