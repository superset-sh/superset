import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { EnrichedPort } from "shared/types";

type KillResult = { success: boolean; error?: string };

async function killOne(
	port: EnrichedPort,
	killLocal: (input: {
		workspaceId: string;
		terminalId: string;
		port: number;
	}) => Promise<KillResult>,
): Promise<KillResult> {
	if (port.hostUrl) {
		return getHostServiceClientByUrl(port.hostUrl).ports.kill.mutate({
			workspaceId: port.workspaceId,
			terminalId: port.terminalId,
			port: port.port,
		});
	}
	return killLocal({
		workspaceId: port.workspaceId,
		terminalId: port.terminalId,
		port: port.port,
	});
}

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();
	const [isPending, setIsPending] = useState(false);

	const killPort = async (port: EnrichedPort) => {
		setIsPending(true);
		try {
			const result = await killOne(port, killMutation.mutateAsync);
			if (!result.success) {
				toast.error(`Failed to close port ${port.port}`, {
					description: result.error,
				});
			}
		} finally {
			setIsPending(false);
		}
	};

	const killPorts = async (ports: EnrichedPort[]) => {
		if (ports.length === 0) return;

		setIsPending(true);
		try {
			const results = await Promise.all(
				ports.map((port) => killOne(port, killMutation.mutateAsync)),
			);

			const failed = results.filter((r) => !r.success);
			if (failed.length > 0) {
				toast.error(`Failed to close ${failed.length} port(s)`);
			}
		} finally {
			setIsPending(false);
		}
	};

	return {
		killPort,
		killPorts,
		isPending: isPending || killMutation.isPending,
	};
}
