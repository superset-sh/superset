import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

export interface PullRequestHandoffTarget {
	projectId: string;
	hostId: string;
	hostUrl: string;
	prNumber: number;
}

/**
 * Hands a prompt to an agent on the pull request: into the workspace already
 * open on it when there is one, otherwise by starting a workspace checked out
 * on the PR with the host's first agent and the prompt as its first turn.
 */
export function usePullRequestAgentHandoff(
	target: PullRequestHandoffTarget | null,
) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const { data: agentConfigs = [] } = useV2AgentConfigs(
		target?.hostUrl ?? null,
	);
	const agent = agentConfigs[0] ?? null;
	const linkedWorkspaceQueryKey = [
		"pullRequests",
		"linkedWorkspace",
		target?.projectId,
		target?.hostUrl,
		target?.prNumber,
	];
	const linkedWorkspaceQuery = {
		queryKey: linkedWorkspaceQueryKey,
		queryFn: () => {
			if (!target) return null;
			return getHostServiceClientByUrl(
				target.hostUrl,
			).pullRequests.getLinkedWorkspace.query({
				projectId: target.projectId,
				prNumber: target.prNumber,
			});
		},
		staleTime: 30_000,
	};
	useQuery({ ...linkedWorkspaceQuery, enabled: target !== null });
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();

	const mutation = useMutation({
		mutationFn: async (prompt: string) => {
			if (!target) {
				throw new Error(
					t({ message: "This pull request has no host to act through" }),
				);
			}
			if (!agent) {
				throw new Error(t({ message: "No agent is configured on this host" }));
			}
			const linkedWorkspaceId =
				(await queryClient.fetchQuery(linkedWorkspaceQuery))?.workspaceId ??
				null;
			if (linkedWorkspaceId) {
				await getHostServiceClientByUrl(target.hostUrl).agents.run.mutate({
					workspaceId: linkedWorkspaceId,
					agent: agent.id,
					prompt,
				});
				return { opened: "existing" as const };
			}
			const { completed } = submitWorkspaceCreate({
				hostId: target.hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: target.projectId,
					pr: target.prNumber,
					agents: [{ agent: agent.id, prompt }],
				},
			});
			const outcome = await completed;
			if (!outcome.ok) throw new Error(outcome.error);
			return { opened: "new" as const };
		},
		onSuccess: ({ opened }) => {
			void queryClient.invalidateQueries({ queryKey: linkedWorkspaceQueryKey });
			toast.success(
				opened === "existing"
					? t({ message: "Sent to the pull request's workspace" })
					: t({ message: "Starting a workspace on this pull request" }),
			);
		},
		onError: (error) => {
			toast.error(t({ message: "Couldn't hand this to an agent" }), {
				description: errorMessage(error),
			});
		},
	});

	return {
		handOff: mutation.mutate,
		isPending: mutation.isPending,
		available: target !== null && agent !== null,
	};
}
