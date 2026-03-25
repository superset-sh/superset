const SSH_HOST_DEVICE_PREFIX = "ssh-host";
const DEFAULT_REMOTE_PORT_BASE = 39000;
const DEFAULT_REMOTE_PORT_RANGE = 1000;

export const SSH_HOST_CONNECTION_STATES = [
	"idle",
	"checking",
	"syncing",
	"installing",
	"starting",
	"forwarding",
	"ready",
	"error",
] as const;

export type SshHostConnectionState =
	(typeof SSH_HOST_CONNECTION_STATES)[number];

export interface SshHostHealthSnapshot {
	deviceClientId: string | null;
	deviceName: string | null;
	hasModelProviderCredentials: boolean;
	status: "ok";
	terminalMode: "pty" | "tmux";
}

export interface SshHostConnectionStatus {
	hostId: string;
	organizationId: string;
	state: SshHostConnectionState;
	hostUrl: string | null;
	localPort: number | null;
	remotePort: number | null;
	lastError: string | null;
	missingPrerequisites: string[];
	health: SshHostHealthSnapshot | null;
	updatedAt: number;
}

function hashString(input: string): number {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function toSlugPart(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24);
}

export function getSshHostDeviceClientId(hostId: string): string {
	return `${SSH_HOST_DEVICE_PREFIX}:${hostId}`;
}

export function isSshHostDeviceClientId(
	deviceClientId: string | null | undefined,
): boolean {
	return Boolean(deviceClientId?.startsWith(`${SSH_HOST_DEVICE_PREFIX}:`));
}

export function getSshHostIdFromDeviceClientId(
	deviceClientId: string | null | undefined,
): string | null {
	if (!isSshHostDeviceClientId(deviceClientId)) {
		return null;
	}

	return deviceClientId.slice(`${SSH_HOST_DEVICE_PREFIX}:`.length);
}

export function getDefaultSshHostRemoteRootDir(hostId: string): string {
	return `~/.superset/ssh-hosts/${hostId}`;
}

export function resolveSshHostRemoteRootDir(
	hostId: string,
	remoteRootDir?: string | null,
): string {
	const trimmed = remoteRootDir?.trim();
	return trimmed && trimmed.length > 0
		? trimmed
		: getDefaultSshHostRemoteRootDir(hostId);
}

export function getSshHostRemotePort(
	organizationId: string,
	hostId: string,
): number {
	return (
		DEFAULT_REMOTE_PORT_BASE +
		(hashString(`${organizationId}:${hostId}`) % DEFAULT_REMOTE_PORT_RANGE)
	);
}

export function getSshHostServiceSessionName(
	organizationId: string,
	hostId: string,
): string {
	return `superset-host-${toSlugPart(hostId)}-${toSlugPart(organizationId)}`;
}

export function getSshTerminalSessionName(workspaceId: string): string {
	return `superset-workspace-${toSlugPart(workspaceId)}`;
}
