import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { EnrichedPort } from "shared/types";
import type { KillablePort } from "./getPortsToKillForPane";

interface KillPortResult {
	success: boolean;
	error?: string;
}

interface KillPortsResult {
	results: KillPortResult[];
	failedCount: number;
}

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();

	const mutatePortKill = async (
		port: Pick<EnrichedPort, "paneId" | "port">,
	): Promise<KillPortResult> => {
		try {
			return await killMutation.mutateAsync({
				paneId: port.paneId,
				port: port.port,
			});
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	};

	const killPort = async (
		port: Pick<EnrichedPort, "paneId" | "port">,
	): Promise<KillPortResult> => {
		const result = await mutatePortKill(port);
		if (!result.success) {
			toast.error(`Failed to close port ${port.port}`, {
				description: result.error,
			});
		}

		return result;
	};

	const killPorts = async (ports: KillablePort[]): Promise<KillPortsResult> => {
		if (ports.length === 0) {
			return {
				results: [],
				failedCount: 0,
			};
		}

		const results = await Promise.all(
			ports.map((port) => mutatePortKill(port)),
		);

		const failedCount = results.filter((result) => !result.success).length;
		if (failedCount > 0) {
			toast.error(`Failed to close ${failedCount} port(s)`);
		}

		return {
			results,
			failedCount,
		};
	};

	return { killPort, killPorts, isPending: killMutation.isPending };
}
