import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAgentChoices } from "renderer/hooks/useAgentChoices";
import { buildPageAgentPrompt } from "renderer/routes/_authenticated/_dashboard/utils/pageAgentPrompt";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

export function useCreatePageWithAgent() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId, activeHostUrl, hostServiceStatus } = useLocalHostService();
	const { agents: agentChoices, isFetched: agentsFetched } =
		useAgentChoices(activeHostUrl);
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();
	const [creatingWithAgent, setCreatingWithAgent] = useState(false);
	const isReady =
		!!activeHostUrl && hostServiceStatus === "running" && agentsFetched;
	const handleCreateWithAgent = () => {
		if (creatingWithAgent || !isReady) return;
		if (!machineId) {
			toast.error(
				t({
					message: "Host service is not running",
				}),
			);
			return;
		}
		const terminalAgents = agentChoices.filter((a) => a.id !== "superset");
		const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
		const agent =
			terminalAgents.find((a) => a.id === stored)?.id ?? terminalAgents[0]?.id;
		if (!agent) {
			toast.error(
				t({
					message: "No terminal agent is configured on this device",
				}),
			);
			return;
		}
		setCreatingWithAgent(true);
		const { workspaceId, completed } = submitWorkspaceCreate({
			hostId: machineId,
			snapshot: {
				id: crypto.randomUUID(),
				projectId: null,
				agents: [{ agent, prompt: buildPageAgentPrompt() }],
			},
		});
		// The store shows creation failures on the optimistic sidebar row; this
		// just re-arms the button if the user navigates back.
		void completed.finally(() => setCreatingWithAgent(false));
		navigate({
			to: "/workspace/$workspaceId",
			params: { workspaceId },
		}).catch((error) => {
			console.error("[CreatePageWithAgent] failed to open workspace", error);
		});
	};

	return {
		creatingWithAgent: creatingWithAgent || !isReady,
		handleCreateWithAgent,
	};
}
