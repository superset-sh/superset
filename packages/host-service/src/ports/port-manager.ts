import { PortManager } from "@superset/port-scanner";
import { treeKillWithEscalation } from "./tree-kill.ts";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});

export const chatPortTerminalIds = new Set<string>();
