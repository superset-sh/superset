import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { errorCopy } from "@/lib/errors";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import {
	agentLaunchPresetId,
	useAgentLaunchPreferences,
} from "@/screens/(authenticated)/hooks/useAgentLaunchPreferences";
import { useHostAgentConfigs } from "@/screens/(authenticated)/hooks/useHostAgentConfigs";
import type { PullRequestDetail } from "../../../../utils/pullRequest";
import { agentPrompt } from "../../utils/agentPrompt";
import { gitlabAgentPrompt } from "../../utils/agentPrompt/agentPrompt";
import type { AgentActionId } from "../../utils/pullRequestState";
import {
	type GitlabActionContext,
	type GitlabActionTarget,
	type GitlabPullRequestDetail,
	gitlabActionTarget,
	gitlabTargetError,
	isGitlabPullRequestDetail,
	sameGitlabActionTarget,
} from "../gitlabActionTarget";

interface NativePrompt {
	prompt: string;
	target: GitlabActionTarget;
}

/**
 * The "… with Agent" buttons: one tap starts a fresh agent session in this
 * workspace with the instruction already sent — there is no edit step — and
 * lands on its tab to watch it work. The agent is whichever one the composer
 * last used, with the model and effort remembered for it.
 */
export function useAskAgent({
	workspaceId,
	owner = null,
	repo = null,
	pullNumber = null,
	gitlab,
}: {
	workspaceId: string | null;
	owner?: string | null;
	repo?: string | null;
	pullNumber?: number | null;
	gitlab?: GitlabActionContext;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const agentId = useNewSessionPreferencesStore((state) => state.agentId);
	const agentConfigs = useHostAgentConfigs({
		machineId: host?.machineId ?? null,
		hostUrl: host ? hostServiceUrl(host.organizationId, host.machineId) : null,
	});
	const agentConfig = agentConfigs.data?.find(
		(config) => config.presetId === agentId,
	);
	// The preset id stands in until the configs answer (see NewChatWidget).
	const launch = useAgentLaunchPreferences(
		agentConfig ? agentLaunchPresetId(agentConfig) : agentId,
	);
	const [busyAction, setBusyAction] = useState<AgentActionId | null>(null);

	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;
	const target = gitlabActionTarget({
		gitlab,
		workspaceId,
		owner,
		repo,
		pullNumber,
		workspace,
		hostUrl,
		organizationId: host?.organizationId ?? null,
	});
	const latestTarget = useRef(target);
	latestTarget.current = target;
	const nativeOwnerLive = useRef(true);
	useEffect(() => {
		nativeOwnerLive.current = true;
		latestTarget.current = target;
		return () => {
			nativeOwnerLive.current = false;
			latestTarget.current = null;
		};
	}, [target]);
	const nativeInFlight = useRef(false);

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: async (prompt: string | NativePrompt) => {
			if (typeof prompt !== "string") {
				if (!sameGitlabActionTarget(prompt.target, latestTarget.current))
					throw gitlabTargetError();
				const result = await getHostServiceClientByUrl(
					prompt.target.hostUrl,
				).agents.run.mutate({
					workspaceId: prompt.target.request.workspaceId,
					agent: agentId,
					prompt: prompt.prompt,
					model: launch.model?.id ?? undefined,
					effort: launch.effort?.id ?? undefined,
					expectedPullRequest: prompt.target.expectedPullRequest,
				});
				if (!sameGitlabActionTarget(prompt.target, latestTarget.current))
					throw gitlabTargetError();
				if (
					!result ||
					typeof result !== "object" ||
					result.kind !== "terminal" ||
					typeof result.label !== "string" ||
					typeof result.sessionId !== "string" ||
					!result.sessionId.trim()
				)
					throw new Error(
						i18n._(
							msg({ message: "The host did not confirm a terminal session" }),
						),
					);
				return {
					terminalId: result.sessionId,
					machineId: host?.machineId ?? "",
				};
			}
			if (gitlab) throw gitlabTargetError();
			if (!workspace || !host) throw new Error("Workspace is not available");
			const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
			const result = await getHostServiceClientByUrl(hostUrl).agents.run.mutate(
				{
					workspaceId: workspace.id,
					agent: agentId,
					prompt,
					model: launch.model?.id ?? undefined,
					effort: launch.effort?.id ?? undefined,
				},
			);
			if (result.kind !== "terminal") {
				throw new Error(`${result.label} did not start a terminal session`);
			}
			return { terminalId: result.sessionId, machineId: host.machineId };
		},
		onSuccess: ({ terminalId, machineId }, variables) => {
			if (
				typeof variables !== "string" &&
				!sameGitlabActionTarget(variables.target, latestTarget.current)
			)
				return;
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(machineId),
			});
			router.dismissTo(
				`/(authenticated)/workspace/${workspaceId}?tab=${terminalId}`,
			);
		},
		onError: (error: Error, variables) => {
			if (typeof variables !== "string" && !nativeOwnerLive.current) return;
			Alert.alert(
				i18n._(
					msg({
						message: "Could not start agent",
					}),
				),
				errorCopy(error),
			);
		},
	});

	const ask = (
		action: AgentActionId,
		detail: PullRequestDetail | GitlabPullRequestDetail,
	) => {
		if (gitlab || isGitlabPullRequestDetail(detail)) {
			if (!nativeOwnerLive.current) return;
			if (nativeInFlight.current) return;
			if (
				!target ||
				!sameGitlabActionTarget(target, latestTarget.current) ||
				!isGitlabPullRequestDetail(detail) ||
				detail.host !== target.expectedPullRequest.host ||
				detail.pullRequest.url !== target.expectedPullRequest.expectedUrl ||
				detail.pullRequest.number !== target.expectedPullRequest.pullNumber
			) {
				Alert.alert(
					i18n._(msg({ message: "Could not start agent" })),
					errorCopy(gitlabTargetError()),
				);
				return;
			}
			nativeInFlight.current = true;
			setBusyAction(action);
			mutation.mutate(
				{ prompt: gitlabAgentPrompt(action, detail), target },
				{
					onSettled: () => {
						nativeInFlight.current = false;
						setBusyAction(null);
					},
				},
			);
			return;
		}
		if (busyAction !== null) return;
		setBusyAction(action);
		mutation.mutate(agentPrompt(action, detail), {
			onSettled: () => setBusyAction(null),
		});
	};

	return { ask, busyAction };
}
