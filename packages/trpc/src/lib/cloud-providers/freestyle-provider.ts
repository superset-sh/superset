import { freestyle } from "freestyle-sandboxes";
import type { CloudWorkspaceStatus } from "@superset/db/schema";
import type {
	CloudProviderInterface,
	CreateVMParams,
	SSHCredentials,
	VMStatus,
} from "./types";

/**
 * Freestyle.dev cloud provider implementation
 *
 * Uses the freestyle-sandboxes SDK to manage cloud VMs.
 * Requires FREESTYLE_API_KEY environment variable to be set.
 *
 * @see https://docs.freestyle.sh/v2/vms
 */
export class FreestyleProvider implements CloudProviderInterface {
	readonly type = "freestyle" as const;

	async createVM(
		params: CreateVMParams,
	): Promise<{ vmId: string; status: CloudWorkspaceStatus }> {
		try {
			const { vmId } = await freestyle.vms.create({
				gitRepos: [
					{
						repo: params.repoUrl,
						path: "/workspace",
						// Use 'rev' for branch/tag/commit
						rev: params.branch,
					},
				],
				workdir: params.workdir ?? "/workspace",
				// Convert minutes to seconds for Freestyle API
				// Default 30 min = 1800 seconds
				idleTimeoutSeconds: params.idleTimeoutSeconds ?? 1800,
			});

			return {
				vmId,
				status: "running",
			};
		} catch (error) {
			console.error("[cloud-providers/freestyle] Failed to create VM:", error);
			throw error;
		}
	}

	async pauseVM(vmId: string): Promise<VMStatus> {
		try {
			// Get VM reference and call suspend
			const vm = freestyle.vms.ref({ vmId });
			await vm.suspend();
			return { status: "paused" };
		} catch (error) {
			console.error("[cloud-providers/freestyle] Failed to pause VM:", error);
			return {
				status: "error",
				message: error instanceof Error ? error.message : "Failed to pause VM",
			};
		}
	}

	async resumeVM(vmId: string): Promise<VMStatus> {
		try {
			// Get VM reference and call start
			const vm = freestyle.vms.ref({ vmId });
			await vm.start();
			return { status: "running" };
		} catch (error) {
			console.error("[cloud-providers/freestyle] Failed to resume VM:", error);
			return {
				status: "error",
				message: error instanceof Error ? error.message : "Failed to resume VM",
			};
		}
	}

	async stopVM(vmId: string): Promise<VMStatus> {
		try {
			// Get VM reference and call stop
			const vm = freestyle.vms.ref({ vmId });
			await vm.stop();
			return { status: "stopped" };
		} catch (error) {
			console.error("[cloud-providers/freestyle] Failed to stop VM:", error);
			return {
				status: "error",
				message: error instanceof Error ? error.message : "Failed to stop VM",
			};
		}
	}

	async deleteVM(vmId: string): Promise<void> {
		try {
			await freestyle.vms.delete({ vmId });
		} catch (error) {
			console.error("[cloud-providers/freestyle] Failed to delete VM:", error);
			throw error;
		}
	}

	async getVMStatus(vmId: string): Promise<VMStatus> {
		try {
			const vm = freestyle.vms.ref({ vmId });
			const info = await vm.getInfo();

			return {
				status: this.mapFreestyleStatus(info.state ?? "unknown"),
			};
		} catch (error) {
			console.error(
				"[cloud-providers/freestyle] Failed to get VM status:",
				error,
			);
			return {
				status: "error",
				message: error instanceof Error ? error.message : "Failed to get status",
			};
		}
	}

	async getSSHCredentials(vmId: string): Promise<SSHCredentials> {
		try {
			// Get VM reference for terminal access
			const vm = freestyle.vms.ref({ vmId });

			// Get terminal list - Freestyle VMs use websocket-based terminal access
			const terminalInfo = await vm.terminals.list();

			if (!terminalInfo.terminals || terminalInfo.terminals.length === 0) {
				throw new Error("No terminal sessions available for this VM");
			}

			// Freestyle uses websocket-based terminal access, not traditional SSH
			// We return connection info that can be used with their terminal API
			// The host would be the VM domain, accessed via Freestyle's infrastructure
			return {
				// Freestyle VMs are accessed via their domain
				host: `${vmId}.freestyle.sh`,
				port: 443, // Freestyle uses HTTPS/WSS
				username: "dev",
				// Token-based auth through Freestyle API
				token: vmId,
			};
		} catch (error) {
			console.error(
				"[cloud-providers/freestyle] Failed to get SSH credentials:",
				error,
			);
			throw error;
		}
	}

	/**
	 * Map Freestyle VM state to our CloudWorkspaceStatus enum
	 */
	private mapFreestyleStatus(state: string): CloudWorkspaceStatus {
		const statusMap: Record<string, CloudWorkspaceStatus> = {
			running: "running",
			suspended: "paused",
			stopped: "stopped",
			starting: "provisioning",
			provisioning: "provisioning",
			error: "error",
			failed: "error",
		};
		return statusMap[state.toLowerCase()] ?? "error";
	}
}
