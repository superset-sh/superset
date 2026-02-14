import type { DetectedPort, MergedPort, StaticPort } from "shared/types";

/**
 * Merge static port configuration with dynamically detected ports.
 *
 * Logic:
 * 1. Only show ports that are actively in use (detected by the port scanner)
 * 2. For active ports matching a static port number: apply the label from config
 * 3. For active ports not in static config: show as dynamic-only entries
 * 4. Sort by port number
 */
export function mergePorts({
	staticPorts,
	dynamicPorts,
	workspaceId,
}: {
	staticPorts: StaticPort[];
	dynamicPorts: DetectedPort[];
	workspaceId: string;
}): MergedPort[] {
	const workspaceDynamicPorts = dynamicPorts.filter(
		(p) => p.workspaceId === workspaceId,
	);

	const staticByPort = new Map(staticPorts.map((p) => [p.port, p]));
	const merged: MergedPort[] = [];

	for (const dynamic of workspaceDynamicPorts) {
		const staticPort = staticByPort.get(dynamic.port);
		merged.push({
			port: dynamic.port,
			workspaceId,
			label: staticPort?.label ?? null,
			isActive: true,
			pid: dynamic.pid,
			processName: dynamic.processName,
			paneId: dynamic.paneId,
			address: dynamic.address,
			detectedAt: dynamic.detectedAt,
		});
	}

	return merged.sort((a, b) => a.port - b.port);
}
