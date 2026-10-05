import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { CLOUD_AGENT_CHOICES } from "renderer/hooks/useV2AgentChoices/cloud-agent-choices";

/** The agents an automation on `hostId` can run; a cloud one has no host to ask. */
export function useAutomationAgentChoices(hostId: string | null | undefined) {
	const cloud = hostId === CLOUD_HOST_ID;
	const hostUrl = useHostUrl(hostId);
	const hostChoices = useV2AgentChoices(hostUrl);
	return cloud ? { agents: CLOUD_AGENT_CHOICES, isFetched: true } : hostChoices;
}
