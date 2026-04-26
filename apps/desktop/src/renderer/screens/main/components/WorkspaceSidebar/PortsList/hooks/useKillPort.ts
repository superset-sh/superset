import { usePortKillActions } from "renderer/hooks/ports/usePortKillActions";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { EnrichedPort } from "shared/types";

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();
	return usePortKillActions<EnrichedPort>({
		localKill: killMutation.mutateAsync,
		externalPending: killMutation.isPending,
	});
}
