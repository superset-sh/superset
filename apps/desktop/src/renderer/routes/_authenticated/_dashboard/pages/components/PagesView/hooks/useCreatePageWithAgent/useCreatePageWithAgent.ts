import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	reportableAgentLaunchError,
	useWorkspaceCreates,
} from "renderer/stores/workspace-creates";
import { PAGE_AGENT_PROMPT } from "./constants";

export function useCreatePageWithAgent() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId, activeHostUrl, hostServiceStatus } = useLocalHostService();
	const { agents: agentChoices, isFetched: agentsFetched } =
		useV2AgentChoices(activeHostUrl);
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
				agents: [{ agent, prompt: PAGE_AGENT_PROMPT }],
			},
		});
		// The store shows a create that never produced a workspace on the
		// optimistic sidebar row. An agent that fails to launch inside a created
		// workspace is not shown there — the user is dropped into the workspace
		// with an empty agent pane and nothing else says why.
		void completed
			.then((outcome) => {
				const launchError = reportableAgentLaunchError(outcome);
				if (launchError !== null) toast.error(launchError);
			})
			.finally(() => setCreatingWithAgent(false));
		navigate({
			to: "/v2-workspace/$workspaceId",
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
