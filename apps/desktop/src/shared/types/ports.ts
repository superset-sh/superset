export type { DetectedPort, PortScheme } from "@superset/port-scanner";

import type {
	DetectedPort,
	PortScheme,
	StaticPortEntry,
} from "@superset/port-scanner";

export interface StaticPortsResult {
	exists: boolean;
	ports: StaticPortEntry[] | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	// Scheme from the workspace's `.superset/ports.json`; null when undeclared.
	scheme: PortScheme | null;
	// null → port belongs to the local Electron port manager.
	// string → URL of the remote host-service that owns this port; kill routes there.
	hostUrl: string | null;
}
