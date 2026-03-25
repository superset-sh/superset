import { env } from "renderer/env.renderer";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";
import { getSshHostIdFromDeviceClientId } from "shared/ssh-hosts";

export type WorkspaceHostTarget =
	| { kind: "local" }
	| { kind: "cloud" }
	| { kind: "device"; deviceId: string }
	| { kind: "ssh"; hostId: string };

export function getCloudWorkspaceHostUrl(): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-workspaces/cloud/host`;
}

export function getWorkspaceHostUrlForDevice(deviceId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-devices/${deviceId}/host`;
}

export function getWorkspaceHostUrlForWorkspace(workspaceId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-workspaces/${workspaceId}/host`;
}

export function resolveCreateWorkspaceHostUrl(
	target: WorkspaceHostTarget,
	localHostUrl: string | null,
	sshHostUrls: Map<string, string> = new Map(),
): string | null {
	switch (target.kind) {
		case "local":
			return localHostUrl;
		case "cloud":
			return getCloudWorkspaceHostUrl();
		case "device":
			return getWorkspaceHostUrlForDevice(target.deviceId);
		case "ssh":
			return sshHostUrls.get(target.hostId) ?? null;
	}
}

interface ResolveWorkspaceSshHostIdInput {
	workspaceDeviceClientId: string | null;
	workspaceSshHostId?: string | null;
	sshStatuses?: ReadonlyMap<string, SshHostConnectionStatus>;
}

export function resolveWorkspaceSshHostId({
	workspaceDeviceClientId,
	workspaceSshHostId = null,
	sshStatuses = new Map(),
}: ResolveWorkspaceSshHostIdInput): string | null {
	if (workspaceSshHostId) {
		return workspaceSshHostId;
	}

	const directSshHostId = getSshHostIdFromDeviceClientId(
		workspaceDeviceClientId,
	);
	if (directSshHostId) {
		return directSshHostId;
	}

	if (!workspaceDeviceClientId) {
		return null;
	}

	for (const [sshHostId, status] of sshStatuses) {
		if (status.health?.deviceClientId === workspaceDeviceClientId) {
			return sshHostId;
		}
	}

	return null;
}

interface ResolveWorkspaceHostUrlInput {
	currentDeviceClientId: string | null;
	localHostUrl: string | null;
	sshStatuses?: ReadonlyMap<string, SshHostConnectionStatus>;
	workspaceDeviceClientId: string | null;
	workspaceId: string;
	workspaceSshHostId?: string | null;
}

export function resolveWorkspaceHostUrl({
	currentDeviceClientId,
	localHostUrl,
	sshStatuses = new Map(),
	workspaceDeviceClientId,
	workspaceId,
	workspaceSshHostId = null,
}: ResolveWorkspaceHostUrlInput): string | null {
	if (workspaceDeviceClientId === currentDeviceClientId) {
		return localHostUrl;
	}

	const sshHostId = resolveWorkspaceSshHostId({
		workspaceDeviceClientId,
		workspaceSshHostId,
		sshStatuses,
	});
	if (sshHostId) {
		return sshStatuses.get(sshHostId)?.hostUrl ?? null;
	}

	return getWorkspaceHostUrlForWorkspace(workspaceId);
}
