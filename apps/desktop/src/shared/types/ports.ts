export type { DetectedPort, StaticPortProtocol } from "@superset/port-scanner";

import type { DetectedPort, StaticPortProtocol } from "@superset/port-scanner";

export interface StaticPort {
	port: number;
	label: string;
	protocol?: StaticPortProtocol;
	workspaceId: string;
}

export interface StaticPortsResult {
	exists: boolean;
	ports: Omit<StaticPort, "workspaceId">[] | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	// Scheme to open this port with, from `.superset/ports.json`. null → not
	// configured; consumers fall back to http.
	protocol: StaticPortProtocol | null;
	// null → port belongs to the local Electron port manager.
	// string → URL of the remote host-service that owns this port; kill routes there.
	hostUrl: string | null;
}
