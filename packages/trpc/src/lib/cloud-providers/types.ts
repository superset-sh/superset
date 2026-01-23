import type {
	CloudProviderType,
	CloudWorkspaceStatus,
} from "@superset/db/schema";

export interface SSHCredentials {
	host: string;
	port: number;
	username: string;
	privateKey?: string;
	token?: string;
}

export interface CreateVMParams {
	repoUrl: string;
	branch: string;
	workspaceName: string;
	workdir?: string;
	idleTimeoutSeconds?: number;
}

export interface VMStatus {
	status: CloudWorkspaceStatus;
	message?: string;
}

export interface CloudProviderInterface {
	readonly type: CloudProviderType;

	/**
	 * Create a new VM with the given repository cloned
	 */
	createVM(params: CreateVMParams): Promise<{
		vmId: string;
		status: CloudWorkspaceStatus;
	}>;

	/**
	 * Pause/suspend the VM (preserves state, faster resume)
	 */
	pauseVM(vmId: string): Promise<VMStatus>;

	/**
	 * Resume a paused VM
	 */
	resumeVM(vmId: string): Promise<VMStatus>;

	/**
	 * Stop the VM (graceful shutdown)
	 */
	stopVM(vmId: string): Promise<VMStatus>;

	/**
	 * Delete the VM permanently
	 */
	deleteVM(vmId: string): Promise<void>;

	/**
	 * Get current VM status
	 */
	getVMStatus(vmId: string): Promise<VMStatus>;

	/**
	 * Get SSH connection credentials for the VM
	 */
	getSSHCredentials(vmId: string): Promise<SSHCredentials>;
}
