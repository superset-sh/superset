export type { DetectedPort, PortScheme } from "@superset/port-scanner";

import type { DetectedPort, PortScheme } from "@superset/port-scanner";

export interface StaticPort {
	port: number;
	label: string;
	scheme: PortScheme;
	workspaceId: string;
}

export interface StaticPortsResult {
	exists: boolean;
	ports: Omit<StaticPort, "workspaceId">[] | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	// Scheme declared for this port in `.superset/ports.json`. Null when the port isn't
	// declared there — and absent entirely from an older host-service, so read it as
	// `scheme ?? "http"`.
	scheme: PortScheme | null;
	// null → port belongs to the local Electron port manager.
	// string → URL of the remote host-service that owns this port; kill routes there.
	hostUrl: string | null;
}
