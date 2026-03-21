import type { EnrichedPort } from "shared/types";

export type KillablePort = Pick<EnrichedPort, "paneId" | "port">;

export function getPortsToKillForPane(
	ports: EnrichedPort[],
	paneId: string,
): KillablePort[] {
	const seenPids = new Set<number>();

	return ports
		.filter((port) => port.paneId === paneId)
		.sort((a, b) => b.detectedAt - a.detectedAt)
		.filter((port) => {
			if (seenPids.has(port.pid)) {
				return false;
			}
			seenPids.add(port.pid);
			return true;
		})
		.map((port) => ({ paneId: port.paneId, port: port.port }));
}
