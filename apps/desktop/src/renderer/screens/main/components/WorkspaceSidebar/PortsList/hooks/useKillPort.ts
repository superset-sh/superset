import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { EnrichedPort } from "shared/types";

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();

	const killPort = async (port: EnrichedPort) => {
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

	const killPorts = async (ports: EnrichedPort[]) => {
		if (ports.length === 0) return;

		const results = await Promise.all(
			ports.map((port) =>
				killMutation.mutateAsync({
					paneId: port.paneId,
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
