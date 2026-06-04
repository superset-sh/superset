export type { DetectedPort } from "@superset/port-scanner";

import type { DetectedPort } from "@superset/port-scanner";

export interface StaticPort {
	port: number;
	label: string;
	workspaceId: string;
}

export interface StaticPortsResult {
	exists: boolean;
	ports: Omit<StaticPort, "workspaceId">[] | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	// null → port belongs to the local Electron port manager.
	// string → URL of the remote host-service that owns this port; kill routes there.
	hostUrl: string | null;
}
