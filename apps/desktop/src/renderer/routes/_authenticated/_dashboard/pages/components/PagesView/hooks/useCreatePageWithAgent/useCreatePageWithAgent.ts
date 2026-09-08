import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { PAGE_AGENT_PROMPT } from "./constants";

export function useCreatePageWithAgent() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { agents: agentChoices } = useV2AgentChoices(activeHostUrl);
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();
	const [creatingWithAgent, setCreatingWithAgent] = useState(false);
	const handleCreateWithAgent = () => {
		if (creatingWithAgent) return;
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
				agents: [{ agent, prompt: PAGE_AGENT_PROMPT }],
			},
		});
		// The store shows creation failures on the optimistic sidebar row; this
		// just re-arms the button if the user navigates back.
		void completed.finally(() => setCreatingWithAgent(false));
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
		}).catch(() => {});
	};

	return { creatingWithAgent, handleCreateWithAgent };
}
