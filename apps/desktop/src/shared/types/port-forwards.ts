export interface ForwardTarget {
	/** Host-service URL for the host, e.g. https://relay.superset.sh/hosts/<orgId>:<machineId>. */
	hostUrl: string;
	workspaceId: string;
	remotePort: number;
}

export interface LocalPortOwner {
	pid: number;
	processName: string;
	terminalId: string;
	workspaceId: string;
}

export type PortForwardStatus =
	| { state: "active"; localPort: number }
	// localOwner is null when the local port scanner does not know the process;
	// only a known owner can be stopped from the UI.
	| { state: "busy"; localPort: number; localOwner: LocalPortOwner | null }
	| { state: "error"; message: string };

export type ForwardTransportKind = "relay";

export interface PortForward {
	/** `${hostUrl}|${workspaceId}|${remotePort}` */
	id: string;
	target: ForwardTarget;
	status: PortForwardStatus;
	transport: ForwardTransportKind;
	connections: number;
}

export function portForwardId({
	hostUrl,
	workspaceId,
	remotePort,
}: ForwardTarget): string {
	return `${hostUrl}|${workspaceId}|${remotePort}`;
}
