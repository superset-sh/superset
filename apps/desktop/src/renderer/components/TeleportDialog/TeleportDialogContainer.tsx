import type { TeleportPlan } from "@superset/shared/teleport";
import {
	buildTeleportPlan,
	derivePaneDisposition,
} from "@superset/shared/teleport";
import { runTeleport } from "@superset/shared/teleport-driver";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { createCloudTeleportOperations } from "./hooks/useTeleport/createCloudTeleportOperations";
import { createTeleportOperations } from "./hooks/useTeleport/createTeleportOperations";
import { TeleportDialog } from "./TeleportDialog";
import type { TeleportDestination, TeleportRunState } from "./types";

/**
 * Everything the dialog needs from the app, in one place.
 *
 * The dialog itself renders phases and nothing else; this holds the two
 * host clients, loads the real plan, and runs the real driver. Keeping them
 * apart is what lets the dialog be opened from anywhere and the flow be
 * exercised without a renderer.
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

export function TeleportDialogContainer({
	open,
	onOpenChange,
	workspaceId,
	workspaceLabel,
	sourceHostId,
}: TeleportDialogContainerProps) {
	// The same resolver the sidebar's other cross-host actions use, so a
	// teleport addresses a host exactly the way a delete or an open does.
	const { cache: hostCache } = useHostWorkspaces();
	const organizationId = useActiveOrganizationId();
	const navigate = useNavigate();
	const [cloudDestinationId, setCloudDestinationId] = useState<string | null>(
		null,
	);
	const [plan, setPlan] = useState<TeleportPlan | null>(null);
	const [run, setRun] = useState<TeleportRunState>(EMPTY_RUN);
	const planRequest = useRef(0);

	const hostUrlFor = useCallback(
		(hostId: string) => hostCache.resolveHostUrl(hostId),
		[hostCache],
	);
	const sourceHostUrl = hostUrlFor(sourceHostId);

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
			setRun({ steps: {}, error: null });
			if (!sourceHostUrl || !plan) return;
			const source = getHostServiceClientByUrl(sourceHostUrl);

			if (host.kind === "cloud") {
				if (!organizationId) return;
				const bindings = await source.terminalAgents.listByWorkspace
					.query({ workspaceId })
					.catch(() => []);
				await runTeleport(
					createCloudTeleportOperations({
						source,
						sourceWorkspaceId: workspaceId,
						organizationId,
						branch: plan.branch,
						workspaceName: workspaceLabel,
						sourceTerminalIds: bindings
							.filter((binding) => !binding.endedAt)
							.map((binding) => binding.terminalId),
						agentByTerminalId: Object.fromEntries(
							bindings.map((binding) => [binding.terminalId, binding.agentId]),
						),
						onDestinationCreated: setCloudDestinationId,
					}),
					({ step, state, error }) =>
						setRun((previous) => ({
							steps: { ...previous.steps, [step]: state },
							error: error ?? previous.error,
						})),
				);
				return;
			}

			const destinationUrl = hostUrlFor(host.id);
			if (!destinationUrl) return;
			const destination = getHostServiceClientByUrl(destinationUrl);
			const sourceState = await source.teleport.sourceState.query({
				workspaceId,
			});
			const project = await findProject(destination, sourceState.worktreePath);
			const bindings = await source.terminalAgents.listByWorkspace
				.query({ workspaceId })
				.catch(() => []);

			await runTeleport(
				createTeleportOperations({
					source,
					destination,
					sourceWorkspaceId: workspaceId,
					destinationProjectId: project?.id ?? "",
					destinationRepositoryPath: project?.repoPath ?? null,
					branch: plan.branch,
					sourceTerminalIds: bindings
						.filter((binding) => !binding.endedAt)
						.map((binding) => binding.terminalId),
					agentByTerminalId: Object.fromEntries(
						bindings.map((binding) => [binding.terminalId, binding.agentId]),
					),
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
				({ step, state, error }) =>
					setRun((previous) => ({
						steps: { ...previous.steps, [step]: state },
						error: error ?? previous.error,
					})),
			);
		},
		[
			workspaceId,
			sourceHostUrl,
			hostUrlFor,
			plan,
			organizationId,
			workspaceLabel,
		],
	);

	return (
		<TeleportDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					planRequest.current++;
					setPlan(null);
					setRun(EMPTY_RUN);
					setCloudDestinationId(null);
				}
				onOpenChange(next);
			}}
			workspaceLabel={workspaceLabel}
			plan={plan}
			run={run}
			onDestinationChosen={loadPlan}
			onConfirm={start}
			onOpenThere={() => {
				if (cloudDestinationId) {
					void navigate({
						to: "/cloud-workspaces/$workspaceId",
						params: { workspaceId: cloudDestinationId },
					});
				}
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
