import { ipcMain } from "electron";
import { portDetector } from "./port-detector";
import { proxyManager } from "./proxy-manager";
import { workspaceManager } from "./workspace-manager";

/**
 * Register IPC handlers for port detection and proxy management
 */
export function registerPortIpcs(): void {
	// Set ports configuration for a workspace
	ipcMain.handle(
		"workspace-set-ports",
		async (
			_event,
			input: {
				workspaceId: string;
				ports: Array<number | { name: string; port: number }>;
			},
		) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				workspace.ports = input.ports;
				await workspaceManager.saveConfig();

				// Reinitialize proxy manager with new configuration
				await proxyManager.initialize(workspace);
				proxyManager.updateTargets(workspace);
				return {
					success: true,
				};
			} catch (error) {
				console.error("[PortIpcs] Error setting ports:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Get detected ports for a worktree
	ipcMain.handle(
		"workspace-get-detected-ports",
		async (_event, input: { worktreeId: string }) => {
			return portDetector.getDetectedPortsMap(input.worktreeId);
		},
	);

	// Get proxy status
	ipcMain.handle("proxy-get-status", async () => {
		return proxyManager.getStatus();
	});
}
