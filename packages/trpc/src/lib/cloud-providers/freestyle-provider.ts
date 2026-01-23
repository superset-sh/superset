import type { CloudWorkspaceStatus } from "@superset/db/schema";
import { Freestyle } from "freestyle-sandboxes";

import { env } from "../../env";
import type {
	CloudProviderInterface,
	CreateVMParams,
	SSHCredentials,
	VMStatus,
} from "./types";

// Freestyle VM statuses mapped to our CloudWorkspaceStatus
const FREESTYLE_STATUS_MAP: Record<string, CloudWorkspaceStatus> = {
	running: "running",
	suspended: "paused",
	stopped: "stopped",
	starting: "provisioning",
	suspending: "paused",
	error: "error",
};

function _mapFreestyleStatus(status: string): CloudWorkspaceStatus {
	return FREESTYLE_STATUS_MAP[status.toLowerCase()] ?? "error";
}

export class FreestyleProvider implements CloudProviderInterface {
	readonly type = "freestyle" as const;
	private freestyle: Freestyle;

	constructor() {
		const apiKey = env.FREESTYLE_API_KEY;
		if (!apiKey) {
			throw new Error(
				"FREESTYLE_API_KEY is required for FreestyleProvider. Set it in your environment variables.",
			);
		}
		this.freestyle = new Freestyle({ apiKey });
	}

	async createVM(params: CreateVMParams): Promise<{
		vmId: string;
		status: CloudWorkspaceStatus;
	}> {
		console.log("[cloud/freestyle] Creating VM for repo:", params.repoUrl, "branch:", params.branch);

		const { vmId } = await this.freestyle.vms.create({
			gitRepos: [
				{
					repo: params.repoUrl,
					path: params.workdir ?? "/workspace",
					rev: params.branch, // Branch, tag, or commit to checkout
				},
			],
			workdir: params.workdir ?? "/workspace",
			idleTimeoutSeconds: params.idleTimeoutSeconds ?? 1800, // 30 min default
			persistence: { type: "sticky" }, // Persist filesystem across restarts
		});

		console.log("[cloud/freestyle] VM created with id:", vmId);
		return { vmId, status: "running" };
	}

	async pauseVM(vmId: string): Promise<VMStatus> {
		console.log("[cloud/freestyle] Suspending VM:", vmId);

		const vm = this.freestyle.vms.ref({ vmId });
		await vm.suspend();

		return { status: "paused" };
	}

	async resumeVM(vmId: string): Promise<VMStatus> {
		console.log("[cloud/freestyle] Resuming VM:", vmId);

		const vm = this.freestyle.vms.ref({ vmId });
		await vm.start();

		return { status: "running" };
	}

	async stopVM(vmId: string): Promise<VMStatus> {
		console.log("[cloud/freestyle] Stopping VM:", vmId);

		// Freestyle doesn't have a separate "stop" - we use suspend for now
		// which preserves state and allows quick resume
		const vm = this.freestyle.vms.ref({ vmId });
		await vm.suspend();

		return { status: "stopped" };
	}

	async deleteVM(vmId: string): Promise<void> {
		console.log("[cloud/freestyle] Deleting VM:", vmId);

		await this.freestyle.vms.delete({ vmId });
	}

	async getVMStatus(vmId: string): Promise<VMStatus> {
		console.log("[cloud/freestyle] Getting status for VM:", vmId);

		// Get VM info - Freestyle SDK ref doesn't directly expose status
		// We need to list and find, or use exec to check if it's running
		try {
			const vm = this.freestyle.vms.ref({ vmId });
			// Try a simple exec to check if VM is running
			await vm.exec("echo ok");
			return { status: "running" };
		} catch (_error) {
			// If exec fails, VM might be suspended or stopped
			console.log("[cloud/freestyle] VM not running, may be paused:", vmId);
			return { status: "paused" };
		}
	}

	async getSSHCredentials(vmId: string): Promise<SSHCredentials> {
		console.log("[cloud/freestyle] Getting SSH credentials for VM:", vmId);

		// Freestyle SSH access is via token-based authentication
		// Format: ssh {vmId}:{token}@vm-ssh.freestyle.sh
		// We need to:
		// 1. Create/get an identity
		// 2. Grant it VM permissions
		// 3. Create a token

		// Create an identity for this SSH session
		const { identity } = await this.freestyle.identities.create({});

		// Grant VM permissions to this identity
		await identity.permissions.vms.grant({ vmId });

		// Create an access token
		const { token } = await identity.tokens.create();

		return {
			host: "vm-ssh.freestyle.sh",
			port: 22,
			username: `${vmId}:${token}`,
			token,
		};
	}
}
