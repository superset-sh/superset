import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import type { PullRequestDetail } from "../../../../utils/pullRequest";
import { agentPrompt } from "../../utils/agentPrompt";
import type { AgentActionId } from "../../utils/pullRequestState";

/**
 * The "… with Agent" buttons: one tap starts a fresh agent session in this
 * workspace with the instruction already sent — there is no edit step — and
 * lands on its tab to watch it work. The agent is whichever one the composer
 * last used.
 */
export function useAskAgent({ workspaceId }: { workspaceId: string | null }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const agentId = useNewSessionPreferencesStore((state) => state.agentId);
	const [busyAction, setBusyAction] = useState<AgentActionId | null>(null);

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: async (prompt: string) => {
			if (!workspace || !host) throw new Error("Workspace is not available");
			const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
			const result = await getHostServiceClientByUrl(hostUrl).agents.run.mutate(
				{
					workspaceId: workspace.id,
					agent: agentId,
					prompt,
				},
			);
			if (result.kind !== "terminal") {
				throw new Error(`${result.label} did not start a terminal session`);
			}
			return { terminalId: result.sessionId, machineId: host.machineId };
		},
		onSuccess: ({ terminalId, machineId }) => {
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(machineId),
			});
			router.dismissTo(
				`/(authenticated)/workspace/${workspaceId}?tab=${terminalId}`,
			);
		},
		onError: (error: Error) => {
			Alert.alert(
				i18n._(
					msg({
						message: "Could not start agent",
					}),
				),
				error.message,
			);
		},
	});

	const ask = (action: AgentActionId, detail: PullRequestDetail) => {
		if (busyAction !== null) return;
		setBusyAction(action);
		mutation.mutate(agentPrompt(action, detail), {
			onSettled: () => setBusyAction(null),
		});
	};

	return { ask, busyAction };
}
