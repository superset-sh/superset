import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { MergedPort } from "shared/types";

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();

	const killPort = async (port: MergedPort) => {
		if (!port.isActive || port.paneId == null) return;

		const result = await killMutation.mutateAsync({
			paneId: port.paneId,
			port: port.port,
		});
		if (!result.success) {
			toast.error(`Failed to close port ${port.port}`, {
				description: result.error,
			});
		}
	};

	const killPorts = async (ports: MergedPort[]) => {
		const portsToKill = ports.filter((p) => p.isActive && p.paneId != null);
		if (portsToKill.length === 0) return;

		const results = await Promise.all(
			portsToKill.map((port) =>
				killMutation.mutateAsync({
					paneId: port.paneId as string,
					port: port.port,
				}),
			),
		);

		const failed = results.filter((r) => !r.success);
		if (failed.length > 0) {
			toast.error(`Failed to close ${failed.length} port(s)`);
		}
	};

	return { killPort, killPorts, isPending: killMutation.isPending };
}
