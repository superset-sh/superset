import { env } from "renderer/env.renderer";

export type WorkspaceHostTarget =
	| { kind: "local" }
	| { kind: "cloud" }
	| { kind: "device"; deviceId: string };

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
): string | null {
	switch (target.kind) {
		case "local":
			return localHostUrl;
		case "cloud":
			return getCloudWorkspaceHostUrl();
		case "device":
			return getWorkspaceHostUrlForDevice(target.deviceId);
	}
}
