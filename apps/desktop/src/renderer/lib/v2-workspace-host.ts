import { env } from "renderer/env.renderer";

export type WorkspaceHostTarget =
	| { kind: "local" }
	| { kind: "cloud" }
	| { kind: "host"; hostId: string };

export function getCloudWorkspaceHostUrl(): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-hosts/cloud/trpc`;
}

export function getRemoteHostUrl(hostId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-hosts/${hostId}/trpc`;
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
		case "host":
			return getRemoteHostUrl(target.hostId);
	}
}
