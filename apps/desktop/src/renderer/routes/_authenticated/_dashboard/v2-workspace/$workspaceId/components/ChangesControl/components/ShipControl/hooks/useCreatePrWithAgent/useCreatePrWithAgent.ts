import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	getTerminalAgentBindingsQueryKey,
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";

/** Poll cadence for the PR link while an agent is working on it. */
const PR_POLL_MS = 3_000;
/** How often to ask the host to re-sync the PR link from GitHub while
 * waiting — the background sync alone can lag the agent's `gh pr create`
 * by a full tick. */
const PR_REFRESH_MS = 15_000;
/** After the agent reports it finished, how long the PR gets to show up
 * (one forced refresh plus a couple of polls) before we call it a miss. */
const AGENT_FINISHED_GRACE_MS = 12_000;
/** Hard stop so the control never spins forever. */
const GIVE_UP_MS = 10 * 60 * 1000;

export interface AgentCreatePrStatus {
	mode: "terminal" | "headless";
	terminalId?: string;
	agentLabel: string;
	startedAt: number;
	/** Host-clock `lastEventAt` of the target when dispatched; later hook
	 * events are the agent reacting to this prompt. Terminal mode only. */
	dispatchedAfter?: number;
}

export interface UseCreatePrWithAgentResult {
	/** Hands the PR to an agent. Resolves once dispatched (not once created). */
	dispatch: () => Promise<void>;
	/** Drops the in-progress state without touching the agent. */
	stopWaiting: () => void;
	status: AgentCreatePrStatus | null;
	isDispatching: boolean;
	/** The live session the next dispatch would target, if any. */
	target: TerminalAgentBinding | null;
	/** Label for the agent the next dispatch would use (live or headless). */
	targetLabel: string | null;
}

function agentLabel(agentId: string): string {
	return (
		(AGENT_IDENTITY_LABELS as Record<string, string | undefined>)[agentId] ??
		agentId
	);
}

/**
 * Which live session gets the prompt: the most recently active agent that
 * is not mid-task, else the most recent one (its TUI queues the message).
 */
function pickTarget(
	bindings: Map<string, TerminalAgentBinding>,
): TerminalAgentBinding | null {
	const sessions = [...bindings.values()].sort(
		(a, b) => b.lastEventAt - a.lastEventAt,
	);
	const idle = sessions.find(
		(session) =>
			session.lastEventType !== "Start" &&
			session.lastEventType !== "PermissionRequest",
	);
	return idle ?? sessions[0] ?? null;
}

/**
 * Owns the agent-driven Create PR flow for one workspace: picks the target
 * (a live agent terminal, else the default agent run headlessly by the
 * host), dispatches through `pullRequests.createWithAgent`, then watches for
 * the outcome. The PR itself arrives through the normal link sync — this
 * polls faster while waiting, nudges a GitHub re-sync when the agent stops,
 * and reports a miss when the agent finishes (or dies) without a PR.
 */
export function useCreatePrWithAgent({
	workspaceId,
	projectId,
	onPrCreated,
}: {
	workspaceId: string;
	projectId: string | null;
	/** Fired once the PR link appears so the control flips to its PR face. */
	onPrCreated: () => void;
}): UseCreatePrWithAgentResult {
	const { t } = useLingui();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const bindings = useTerminalAgentBindings(workspaceId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);

	const [status, setStatus] = useState<AgentCreatePrStatus | null>(null);
	const target = useMemo(() => pickTarget(bindings), [bindings]);
	// The bindings map the dispatch was made against: a *different* map that
	// lacks the target means the host reported it gone (the map is only
	// rebuilt when the query data changes), whereas an unchanged map says
	// nothing new yet.
	const dispatchBindingsRef = useRef<Map<string, TerminalAgentBinding> | null>(
		null,
	);
	// Whether the target has been seen working since the dispatch; a Stop
	// before that belongs to whatever it was doing when the prompt queued.
	const sawStartRef = useRef(false);
	const headlessConfig = configs[0] ?? null;
	const targetLabel = target
		? agentLabel(target.agentId)
		: (headlessConfig?.label ?? null);

	const createMutation =
		workspaceTrpc.pullRequests.createWithAgent.useMutation();
	const refreshMutation =
		workspaceTrpc.pullRequests.refreshByWorkspaces.useMutation();

	const stopWaiting = useCallback(() => setStatus(null), []);

	const dispatch = useCallback(async () => {
		const liveTarget = target;
		try {
			const result = await createMutation.mutateAsync({
				workspaceId,
				...(liveTarget
					? { terminalId: liveTarget.terminalId }
					: headlessConfig
						? { agent: headlessConfig.id }
						: {}),
			});
			const label =
				result.mode === "terminal"
					? agentLabel(result.agentId)
					: result.agentLabel;
			dispatchBindingsRef.current = bindings;
			sawStartRef.current = false;
			setStatus({
				mode: result.mode,
				...(result.mode === "terminal"
					? {
							terminalId: result.terminalId,
							dispatchedAfter: liveTarget?.lastEventAt ?? 0,
						}
					: {}),
				agentLabel: label,
				startedAt: Date.now(),
			});
			toast.info(
				t({
					id: "workspace.shipControl.agentCreatingPr",
					message: "Agent is creating the pull request…",
				}),
				{
					description:
						result.mode === "terminal"
							? t({
									id: "workspace.shipControl.agentSentTo",
									message: `Sent to ${label}`,
								})
							: t({
									id: "workspace.shipControl.agentRunningHeadless",
									message: `Running ${label} in the background`,
								}),
				},
			);
		} catch (error) {
			// The likeliest failure is a target whose pty died while its
			// session row lagged behind — refetch the bindings so the next
			// click doesn't aim at the same dead agent.
			if (liveTarget) {
				void queryClient.invalidateQueries({
					queryKey: getTerminalAgentBindingsQueryKey(workspaceId),
				});
			}
			toast.error(
				t({
					id: "workspace.shipControl.agentDispatchFailed",
					message: "Couldn't hand the pull request to an agent",
				}),
				{
					description: errorMessage(
						error,
						t({
							id: "workspace.shipControl.unknownError",
							message: "Unknown error",
						}),
					),
				},
			);
		}
	}, [
		bindings,
		createMutation,
		headlessConfig,
		queryClient,
		t,
		target,
		workspaceId,
	]);

	// ── Waiting for the outcome ────────────────────────────────────────

	const waiting = status !== null;
	// Same query key as usePRFlowState's, so the faster interval here just
	// tightens the shared observer while an agent is at work.
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{ enabled: waiting, refetchInterval: waiting ? PR_POLL_MS : false },
	);
	const headlessStatusQuery =
		workspaceTrpc.pullRequests.agentCreateStatus.useQuery(
			{ workspaceId },
			{
				enabled: status?.mode === "headless",
				refetchInterval: status?.mode === "headless" ? PR_POLL_MS : false,
			},
		);

	const onPrCreatedRef = useRef(onPrCreated);
	onPrCreatedRef.current = onPrCreated;
	const refreshRef = useRef(refreshMutation);
	refreshRef.current = refreshMutation;
	const lastRefreshAtRef = useRef(0);
	const requestRefresh = useCallback(
		(force: boolean) => {
			const now = Date.now();
			if (!force && now - lastRefreshAtRef.current < PR_REFRESH_MS) return;
			if (refreshRef.current.isPending) return;
			lastRefreshAtRef.current = now;
			refreshRef.current
				.mutateAsync({ workspaceIds: [workspaceId] })
				.catch((error) => {
					console.warn("[create-pr-with-agent] PR link refresh failed", error);
				});
		},
		[workspaceId],
	);

	// Success: the PR link appeared.
	const createdPr = waiting ? prQuery.data : null;
	useEffect(() => {
		if (!createdPr) return;
		setStatus(null);
		onPrCreatedRef.current();
		toast.success(
			t({
				id: "workspace.shipControl.prCreated",
				message: `PR #${createdPr.number} created`,
			}),
			{
				action: {
					label: t({
						id: "workspace.shipControl.openPrToastAction",
						message: "Open",
					}),
					onClick: () => {
						if (projectId == null) return;
						usePullRequestsSplitViewStore.getState().expandDetail();
						void navigate({
							to: "/pull-requests/$prNumber",
							params: { prNumber: String(createdPr.number) },
							search: { project: projectId },
						});
					},
				},
			},
		);
	}, [createdPr, navigate, projectId, t]);

	// Terminal mode: the binding tells us when the agent stopped or died.
	const targetBinding =
		status?.mode === "terminal" && status.terminalId
			? (bindings.get(status.terminalId) ?? null)
			: null;
	if (
		status?.mode === "terminal" &&
		targetBinding &&
		targetBinding.lastEventType === "Start" &&
		targetBinding.lastEventAt > (status.dispatchedAfter ?? 0)
	) {
		sawStartRef.current = true;
	}
	const agentFinishedAt = useMemo(() => {
		if (!status) return null;
		if (status.mode === "headless") {
			const run = headlessStatusQuery.data;
			return run && run.status !== "running"
				? (run.finishedAt ?? Date.now())
				: null;
		}
		if (
			sawStartRef.current &&
			targetBinding &&
			targetBinding.lastEventType === "Stop" &&
			targetBinding.lastEventAt > (status.dispatchedAfter ?? 0)
		) {
			return targetBinding.lastEventAt;
		}
		return null;
	}, [headlessStatusQuery.data, status, targetBinding]);

	// Headless failure is definitive — the host saw the process exit non-zero.
	const headlessError =
		status?.mode === "headless" && headlessStatusQuery.data?.status === "failed"
			? (headlessStatusQuery.data.error ?? "")
			: null;
	useEffect(() => {
		if (headlessError === null) return;
		setStatus(null);
		toast.error(
			t({
				id: "workspace.shipControl.agentHeadlessFailed",
				message: "The agent couldn't create the pull request",
			}),
			{ description: headlessError || undefined },
		);
	}, [headlessError, t]);

	// A dispatched terminal whose binding vanished died under the agent.
	const targetGone =
		status?.mode === "terminal" &&
		targetBinding === null &&
		dispatchBindingsRef.current !== null &&
		bindings !== dispatchBindingsRef.current;
	useEffect(() => {
		if (!targetGone) return;
		setStatus(null);
		toast.error(
			t({
				id: "workspace.shipControl.agentSessionEnded",
				message: "The agent session ended before the pull request was created",
			}),
		);
	}, [targetGone, t]);

	// The agent said it's done: force a GitHub re-sync, then give the link a
	// short grace window before reporting a miss.
	useEffect(() => {
		if (agentFinishedAt === null || headlessError !== null) return;
		requestRefresh(true);
		const remaining = Math.max(
			0,
			agentFinishedAt + AGENT_FINISHED_GRACE_MS - Date.now(),
		);
		const timer = window.setTimeout(() => {
			setStatus(null);
			toast.warning(
				t({
					id: "workspace.shipControl.agentFinishedNoPr",
					message: "The agent finished without opening a pull request",
				}),
				{
					description: t({
						id: "workspace.shipControl.agentFinishedNoPrHint",
						message: "Check what it reported, or create the PR manually",
					}),
				},
			);
		}, remaining);
		return () => window.clearTimeout(timer);
	}, [agentFinishedAt, headlessError, requestRefresh, t]);

	// Periodic re-sync while waiting, and a hard give-up.
	useEffect(() => {
		if (!status) return;
		lastRefreshAtRef.current = status.startedAt;
		const interval = window.setInterval(
			() => requestRefresh(false),
			PR_REFRESH_MS,
		);
		const giveUp = window.setTimeout(
			() => {
				setStatus(null);
				toast.warning(
					t({
						id: "workspace.shipControl.agentGaveUp",
						message: "Still no pull request from the agent",
					}),
					{
						description: t({
							id: "workspace.shipControl.agentGaveUpHint",
							message:
								"Stopped waiting after 10 minutes — check the agent, or create the PR manually",
						}),
					},
				);
			},
			Math.max(0, status.startedAt + GIVE_UP_MS - Date.now()),
		);
		return () => {
			window.clearInterval(interval);
			window.clearTimeout(giveUp);
		};
	}, [status, requestRefresh, t]);

	return {
		dispatch,
		stopWaiting,
		status,
		isDispatching: createMutation.isPending,
		target,
		targetLabel,
	};
}
