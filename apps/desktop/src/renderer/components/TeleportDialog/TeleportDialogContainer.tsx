import { useLingui } from "@lingui/react/macro";
import type { TeleportPlan } from "@superset/shared/teleport";
import {
	buildTeleportPlan,
	derivePaneDisposition,
} from "@superset/shared/teleport";
import {
	runTeleport,
	type TeleportProgress,
} from "@superset/shared/teleport-driver";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { createCloudTeleportOperations } from "./hooks/useTeleport/createCloudTeleportOperations";
import { createTeleportOperations } from "./hooks/useTeleport/createTeleportOperations";
import { useTeleportRunsStore } from "./stores/teleportRunsStore";
import { TeleportDialog } from "./TeleportDialog";
import type { TeleportDestination, TeleportRunState } from "./types";
import { deriveRunOutcome } from "./utils/runOutcome";

/**
 * Everything the dialog needs from the app, in one place.
 *
 * The dialog itself renders phases and nothing else; this holds the two
 * host clients, loads the real plan, and runs the real driver. The run's
 * progress lives in a store keyed by workspace, not here: the dialog can be
 * closed while the move continues, reopened onto it, and a move nobody is
 * watching announces its end with a toast.
 */

interface TeleportDialogContainerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	workspaceLabel: string;
	/** The host the workspace lives on now. */
	sourceHostId: string;
}

const EMPTY_RUN: TeleportRunState = { steps: {}, error: null };
/** Long enough to come back to; a finished move is worth more than a glance. */
const FINISHED_TOAST_MS = 15_000;

export function TeleportDialogContainer({
	open,
	onOpenChange,
	workspaceId,
	workspaceLabel,
	sourceHostId,
}: TeleportDialogContainerProps) {
	const { t } = useLingui();
	// The same resolver the sidebar's other cross-host actions use, so a
	// teleport addresses a host exactly the way a delete or an open does.
	const { cache: hostCache } = useHostWorkspaces();
	const organizationId = useActiveOrganizationId();
	const setCloudInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const navigate = useNavigate();
	const record = useTeleportRunsStore((state) => state.runs[workspaceId]);
	const [plan, setPlan] = useState<TeleportPlan | null>(null);
	const planRequest = useRef(0);
	const run = record?.run ?? EMPTY_RUN;

	// While this dialog is mounted the run is being watched, so its ending
	// shows here and not as a toast.
	useEffect(() => {
		useTeleportRunsStore.getState().setWatched(workspaceId, true);
		return () => useTeleportRunsStore.getState().setWatched(workspaceId, false);
	}, [workspaceId]);

	const hostUrlFor = useCallback(
		(hostId: string) => hostCache.resolveHostUrl(hostId),
		[hostCache],
	);
	const sourceHostUrl = hostUrlFor(sourceHostId);

	const openDestination = useCallback(
		(host: TeleportDestination, cloudDestinationId: string | null) => {
			useTeleportRunsStore.getState().clear(workspaceId);
			if (host.kind === "cloud" && cloudDestinationId) {
				if (organizationId) {
					setCloudInSidebar(organizationId, cloudDestinationId, true);
				}
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: cloudDestinationId },
				});
			}
		},
		[workspaceId, organizationId, setCloudInSidebar, navigate],
	);

	const announce = useCallback(
		(host: TeleportDestination) => {
			const finished = useTeleportRunsStore.getState().runs[workspaceId];
			if (!finished) return;
			const outcome = deriveRunOutcome(finished.run);
			// The destination joins the sidebar as soon as it is real, so it can
			// be found after the toast is gone and whether or not anyone watched.
			if (
				outcome === "done" &&
				host.kind === "cloud" &&
				finished.cloudDestinationId &&
				organizationId
			) {
				setCloudInSidebar(organizationId, finished.cloudDestinationId, true);
			}
			if (finished.watched) return;
			if (outcome === "done") {
				const { cloudDestinationId } = finished;
				toast.success(t({ message: `Teleported to ${host.name}` }), {
					description: workspaceLabel,
					duration: FINISHED_TOAST_MS,
					action: {
						label: t({ message: `Open on ${host.name}` }),
						onClick: () => openDestination(host, cloudDestinationId),
					},
					onDismiss: () => useTeleportRunsStore.getState().clear(workspaceId),
					onAutoClose: () => useTeleportRunsStore.getState().clear(workspaceId),
				});
			} else if (outcome === "failed") {
				toast.error(t({ message: `Teleport to ${host.name} failed` }), {
					description: finished.run.error ?? workspaceLabel,
					onDismiss: () => useTeleportRunsStore.getState().clear(workspaceId),
					onAutoClose: () => useTeleportRunsStore.getState().clear(workspaceId),
				});
			}
		},
		[
			workspaceId,
			workspaceLabel,
			t,
			openDestination,
			organizationId,
			setCloudInSidebar,
		],
	);

	const loadPlan = useCallback(
		async (host: TeleportDestination) => {
			const request = ++planRequest.current;
			setPlan(null);
			if (!sourceHostUrl) return;

			const source = getHostServiceClientByUrl(sourceHostUrl);
			const destinationUrl = hostUrlFor(host.id);
			const destination = destinationUrl
				? getHostServiceClientByUrl(destinationUrl)
				: null;

			const sourceState = await source.teleport.sourceState.query({
				workspaceId,
			});
			const branch = sourceState.branch ?? "";

			// Which panes are running what, so every one gets a row and a verb.
			const bindings = await source.terminalAgents.listByWorkspace
				.query({ workspaceId })
				.catch(() => []);
			const panes = bindings
				.filter((binding) => !binding.endedAt)
				.map((binding) => ({
					paneId: binding.terminalId,
					label: binding.agentId,
					disposition: derivePaneDisposition({
						agentId: binding.agentId,
						agentSessionId: binding.agentSessionId ?? null,
						// Context travels as a prompt, so a pane resumes
						// whether or not its harness can restore a session id.
						canResumeSession: true,
						foregroundCommand: null,
					}),
				}));

			if (host.kind === "cloud") {
				// A sandbox is new by construction: nothing to diverge from,
				// and it clones the repository before anything else.
				if (request !== planRequest.current) return;
				setPlan(
					buildTeleportPlan({
						branch,
						destinationHostName: host.name,
						destinationHasRepository: false,
						workingTree: sourceState.workingTree,
						tabs:
							panes.length > 0
								? [{ tabId: "panes", title: "Panes", panes }]
								: [],
					}),
				);
				return;
			}

			// The destination's own view: does it have the branch, is it
			// checked out, has it diverged. Refusals come from the source,
			// which is the only side that can say what it contains.
			const project = destination
				? await findProject(destination, sourceState.worktreePath)
				: null;
			const destinationState =
				destination && project
					? await destination.teleport.destinationState
							.query({ repositoryPath: project.repoPath, branch })
							.catch(() => null)
					: null;
			const refusal = destinationState
				? await source.teleport.checkDestination
						.query({ workspaceId, branch, destination: destinationState })
						.catch(() => null)
				: null;

			if (request !== planRequest.current) return;
			setPlan(
				buildTeleportPlan({
					branch,
					destinationHostName: host.name,
					destinationHasRepository: project !== null,
					workingTree: sourceState.workingTree,
					tabs:
						panes.length > 0 ? [{ tabId: "panes", title: "Panes", panes }] : [],
					refusals: refusal ? [refusal] : [],
				}),
			);
		},
		[workspaceId, sourceHostUrl, hostUrlFor],
	);

	const start = useCallback(
		async (host: TeleportDestination) => {
			if (!sourceHostUrl || !plan) return;
			const source = getHostServiceClientByUrl(sourceHostUrl);
			useTeleportRunsStore.getState().begin(workspaceId, host);
			const report = (event: TeleportProgress) =>
				useTeleportRunsStore.getState().progress(workspaceId, event);

			const bindings = await source.terminalAgents.listByWorkspace
				.query({ workspaceId })
				.catch(() => []);
			const sourceTerminalIds = bindings
				.filter((binding) => !binding.endedAt)
				.map((binding) => binding.terminalId);
			const agentByTerminalId = Object.fromEntries(
				bindings.map((binding) => [binding.terminalId, binding.agentId]),
			);

			if (host.kind === "cloud") {
				if (!organizationId) return;
				await runTeleport(
					createCloudTeleportOperations({
						source,
						sourceWorkspaceId: workspaceId,
						organizationId,
						branch: plan.branch,
						workspaceName: workspaceLabel,
						sourceTerminalIds,
						agentByTerminalId,
						onDestinationCreated: (cloudDestinationId) =>
							useTeleportRunsStore
								.getState()
								.setCloudDestination(workspaceId, cloudDestinationId),
					}),
					report,
				);
				announce(host);
				return;
			}

			const destinationUrl = hostUrlFor(host.id);
			if (!destinationUrl) return;
			const destination = getHostServiceClientByUrl(destinationUrl);
			const sourceState = await source.teleport.sourceState.query({
				workspaceId,
			});
			const project = await findProject(destination, sourceState.worktreePath);

			await runTeleport(
				createTeleportOperations({
					source,
					destination,
					sourceWorkspaceId: workspaceId,
					destinationProjectId: project?.id ?? "",
					destinationRepositoryPath: project?.repoPath ?? null,
					branch: plan.branch,
					sourceTerminalIds,
					agentByTerminalId,
					createDestinationWorkspace: async ({ projectId, branch }) => {
						const created = await destination.workspaces.create.mutate({
							projectId,
							branch,
							checkout: "worktree",
						});
						return created.workspace.id;
					},
					launchAgent: ({
						workspaceId: destinationWorkspaceId,
						agent,
						prompt,
					}) =>
						destination.agents.run.mutate({
							workspaceId: destinationWorkspaceId,
							agent,
							prompt,
						}),
				}),
				report,
			);
			announce(host);
		},
		[
			workspaceId,
			sourceHostUrl,
			hostUrlFor,
			plan,
			organizationId,
			workspaceLabel,
			announce,
		],
	);

	return (
		<TeleportDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					planRequest.current++;
					setPlan(null);
					// A finished run is read; one still going keeps its record
					// so the sidebar shows it and its ending gets announced.
					if (record && deriveRunOutcome(record.run) !== "running") {
						useTeleportRunsStore.getState().clear(workspaceId);
					}
				}
				onOpenChange(next);
			}}
			workspaceLabel={workspaceLabel}
			plan={plan}
			run={run}
			resumeRun={record?.destination ?? null}
			onDestinationChosen={loadPlan}
			onConfirm={start}
			onOpenThere={(host) => {
				openDestination(host, record?.cloudDestinationId ?? null);
				onOpenChange(false);
			}}
		/>
	);
}

/**
 * The destination's project for the same repository, matched on the repo
 * directory name. A destination that has never seen the repository returns
 * null, which is what turns the plan's "Repo" row into "clones first".
 */
async function findProject(
	client: ReturnType<typeof getHostServiceClientByUrl>,
	sourceWorktreePath: string,
): Promise<{ id: string; repoPath: string } | null> {
	const projects = await client.project.list.query().catch(() => []);
	const name = repoNameOf(sourceWorktreePath);
	const match = projects.find(
		(project: { repoPath: string }) => repoNameOf(project.repoPath) === name,
	);
	return match ? { id: match.id, repoPath: match.repoPath } : null;
}

function repoNameOf(path: string): string {
	return path.replace(/\/+$/, "").split("/").pop() ?? "";
}
