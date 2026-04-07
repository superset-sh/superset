// Explicit command registration for compiled binary support.
// The file-based router scans at dev time, but bun --compile
// needs static imports.

import { skip } from "@superset/cli-framework";
import authLoginCmd from "./auth/login/command";
import authLogoutCmd from "./auth/logout/command";
import authWhoamiCmd from "./auth/whoami/command";
import devicesListCmd from "./devices/list/command";
import hostInstallCmd from "./host/install/command";
import hostStartCmd from "./host/start/command";
import hostStatusCmd from "./host/status/command";
import hostStopCmd from "./host/stop/command";
import rootMiddleware from "./middleware";
import orgListCmd from "./org/list/command";
import orgSwitchCmd from "./org/switch/command";
import tasksCreateCmd from "./tasks/create/command";
import tasksDeleteCmd from "./tasks/delete/command";
import tasksGetCmd from "./tasks/get/command";
import tasksListCmd from "./tasks/list/command";
import tasksUpdateCmd from "./tasks/update/command";
import workspacesCreateCmd from "./workspaces/create/command";
import workspacesDeleteCmd from "./workspaces/delete/command";
import workspacesListCmd from "./workspaces/list/command";

export type CommandEntry = {
	path: string[];
	command: any;
	description?: string;
	aliases?: string[];
};

export type GroupEntry = {
	path: string[];
	description: string;
	aliases?: string[];
};

export const groups: GroupEntry[] = [
	{ path: ["auth"], description: "Login, logout, and identity" },
	{ path: ["devices"], description: "List devices" },
	{ path: ["host"], description: "Manage host service" },
	{ path: ["org"], description: "Manage organizations" },
	{ path: ["tasks"], description: "Manage tasks", aliases: ["t"] },
	{ path: ["workspaces"], description: "Manage workspaces", aliases: ["ws"] },
];

export const commands: CommandEntry[] = [
	{ path: ["auth", "login"], command: authLoginCmd },
	{ path: ["auth", "logout"], command: authLogoutCmd },
	{ path: ["auth", "whoami"], command: authWhoamiCmd },
	{ path: ["devices", "list"], command: devicesListCmd },
	{ path: ["host", "install"], command: hostInstallCmd },
	{ path: ["host", "start"], command: hostStartCmd },
	{ path: ["host", "status"], command: hostStatusCmd },
	{ path: ["host", "stop"], command: hostStopCmd },
	{ path: ["org", "list"], command: orgListCmd },
	{ path: ["org", "switch"], command: orgSwitchCmd },
	{ path: ["tasks", "create"], command: tasksCreateCmd },
	{ path: ["tasks", "delete"], command: tasksDeleteCmd },
	{ path: ["tasks", "get"], command: tasksGetCmd },
	{ path: ["tasks", "list"], command: tasksListCmd },
	{ path: ["tasks", "update"], command: tasksUpdateCmd },
	{ path: ["workspaces", "create"], command: workspacesCreateCmd },
	{ path: ["workspaces", "delete"], command: workspacesDeleteCmd },
	{ path: ["workspaces", "list"], command: workspacesListCmd },
];

export const middlewareMap: Record<string, any> = {
	"": rootMiddleware,
	auth: skip,
	host: skip,
};
