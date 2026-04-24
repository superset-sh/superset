import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { DashboardSidebarPort } from "../useDashboardSidebarPortsData";

type KillResult = { success: boolean; error?: string };

async function killOne(port: DashboardSidebarPort): Promise<KillResult> {
	return getHostServiceClientByUrl(port.hostUrl).ports.kill.mutate({
		paneId: port.paneId,
		port: port.port,
	});
}

export function useDashboardSidebarPortKill() {
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);

	const killPort = async (port: DashboardSidebarPort) => {
		setIsPending(true);
		try {
			const result = await killOne(port);
			if (!result.success) {
				toast.error(`Failed to close port ${port.port}`, {
					description: result.error,
				});
			}
			await queryClient.invalidateQueries({
				queryKey: ["host-service", "ports", "getAll"],
			});
		} catch (error) {
			toast.error(`Failed to close port ${port.port}`, {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsPending(false);
		}
	};

	const killPorts = async (ports: DashboardSidebarPort[]) => {
		if (ports.length === 0) return;

		setIsPending(true);
		try {
			const results = await Promise.allSettled(ports.map(killOne));
			const failed = results.filter(
				(result) =>
					result.status === "rejected" ||
					(result.status === "fulfilled" && !result.value.success),
			);
			if (failed.length > 0) {
				toast.error(`Failed to close ${failed.length} port(s)`);
			}
			await queryClient.invalidateQueries({
				queryKey: ["host-service", "ports", "getAll"],
			});
		} finally {
			setIsPending(false);
		}
	};

	return {
		isPending,
		killPort,
		killPorts,
	};
}
