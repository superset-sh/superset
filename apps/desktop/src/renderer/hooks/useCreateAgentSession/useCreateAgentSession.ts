import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

export function useCreateAgentSession() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { agents } = useV2AgentChoices(activeHostUrl);
	const { submit } = useWorkspaceCreates();
	const busy = useRef(false);
	const [isPending, setIsPending] = useState(false);

	const createSession = async (prompt: string): Promise<boolean> => {
		if (busy.current) return false;
		if (!machineId) {
			toast.error(t({ message: "Host service is not running" }));
			return false;
		}
		const terminalAgents = agents.filter((agent) => agent.id !== "superset");
		const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
		const agent =
			terminalAgents.find((option) => option.id === stored)?.id ??
			terminalAgents[0]?.id;
		if (!agent) {
			toast.error(
				t({ message: "No terminal agent is configured on this device" }),
			);
			return false;
		}
		busy.current = true;
		setIsPending(true);
		try {
			const { workspaceId, completed } = submit({
				hostId: machineId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: null,
					agents: [{ agent, prompt }],
				},
			});
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			}).catch((error) => toast.error(errorMessage(error)));
			const result = await completed;
			return result.ok;
		} catch (error) {
			toast.error(errorMessage(error));
			return false;
		} finally {
			busy.current = false;
			setIsPending(false);
		}
	};
	return { createSession, isPending };
}
