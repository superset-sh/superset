import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getCollections,
	preloadCollections,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyProjectSidebarState,
	collectProjectSidebarState,
} from "./moveProjectSidebarState";

const TARGET_HOST_READY_TIMEOUT_MS = 30_000;
const TARGET_HOST_POLL_INTERVAL_MS = 500;

export interface MoveProjectToOrganizationArgs {
	projectId: string;
	targetOrganizationId: string;
}

/** What a move is about to cost, so the confirmation can be specific. */
export interface MoveImpact {
	/** Live terminal sessions across the project's workspaces. */
	terminalCount: number;
	/**
	 * Per workspace, so the count can be accounted for. Sessions running in
	 * the background — no pane attached — are counted too, which is why this
	 * total can exceed the terminals visibly open.
	 */
	workspaceBreakdown: Array<{ name: string; terminalCount: number }>;
}

export interface MoveProjectToOrganizationResult {
	/** Worktrees the target host refused to adopt, by workspace name. */
	skippedWorkspaces: string[];
}

/**
 * Moves a project — its worktrees and its sidebar placement — from the active
 * organization to another one the user belongs to.
 *
 * The move is entirely local. Which org owns a project is decided by which
 * host database holds its row (`~/.superset/host/<orgId>/host.db` — there is
 * no org column), so moving it means re-registering on the destination org's
 * host, not updating a field. The project id is preserved throughout:
 * worktrees live under `~/.superset/worktrees/<projectId>/`, so keeping the id
 * means nothing on disk moves.
 *
 * Deliberately no cloud write. `plans/remove-cloud-project-model.md` retires
 * `v2_projects` and the `v2Project` router, so a project's org is becoming
 * host-local by design; re-keying cloud rows here would add to a router with a
 * deletion date. The residue is the destination's `v2_workspaces` rows still
 * carrying the old org until those tables go — invisible in the sidebar, which
 * reads the host fan-out.
 *
 * Order is load-bearing:
 *  1. start the destination host first, so it exists to receive the project;
 *  2. register the project and adopt its worktrees there, keeping every id;
 *  3. copy the sidebar placement into the destination org;
 *  4. detach from the source host LAST, and only via `project.detach`, which
 *     drops rows without running `git worktree remove` — the ordinary remove
 *     would delete the worktrees just adopted.
 *
 * Nothing on the source changes until step 4, so a failure earlier leaves the
 * project exactly where it started.
 *
 * Live terminals and agent sessions do not survive: they belong to the source
 * org's pty daemon and there is no way to re-parent them across orgs.
 */
export function useMoveProjectToOrganization() {
	const collections = useCollections();
	const { activeHostUrl, activeOrganizationId, waitForHostReady } =
		useLocalHostService();
	const { removeProjectFromSidebar } = useDashboardSidebarState();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	// The coordinator exposes no bare start, so a cold host has to be brought
	// up with `restart`. Only ever call it when the host ISN'T already
	// running: restart is stop-then-start, which would kill the terminals and
	// agent sessions of every OTHER project in the destination org.
	const { mutateAsync: restartHostService } =
		electronTrpc.hostServiceCoordinator.restart.useMutation();
	const [isMoving, setIsMoving] = useState(false);

	/** Returns the destination org's host URL, starting it only if it's down. */
	const waitForTargetHost = useCallback(
		async (organizationId: string): Promise<string> => {
			const resolve = (connection: {
				port?: number | null;
				secret?: string | null;
			}): string | null => {
				if (!connection?.port) return null;
				const hostUrl = `http://127.0.0.1:${connection.port}`;
				if (connection.secret) setHostServiceSecret(hostUrl, connection.secret);
				return hostUrl;
			};

			const running = resolve(
				(await utils.hostServiceCoordinator.getConnection.fetch({
					organizationId,
				})) ?? {},
			);
			if (running) return running;

			await restartHostService({ organizationId });
			const deadline = Date.now() + TARGET_HOST_READY_TIMEOUT_MS;
			while (Date.now() < deadline) {
				const hostUrl = resolve(
					(await utils.hostServiceCoordinator.getConnection.fetch({
						organizationId,
					})) ?? {},
				);
				if (hostUrl) return hostUrl;
				await new Promise((resolve) =>
					setTimeout(resolve, TARGET_HOST_POLL_INTERVAL_MS),
				);
			}
			throw new Error(
				"The destination organization's host service did not start. Try again in a moment.",
			);
		},
		[restartHostService, utils],
	);

	/**
	 * Live terminal sessions per workspace, from the host that currently serves
	 * them. Used both to tell the user what a move will close and to queue the
	 * same shells for re-opening on the other side.
	 */
	const collectLiveTerminals = useCallback(
		async (
			hostUrl: string,
			workspaces: Array<{ id: string; name: string }>,
		): Promise<Map<string, { name: string; terminalIds: string[] }>> => {
			const client = getHostServiceClientByUrl(hostUrl);
			const byWorkspace = new Map<
				string,
				{ name: string; terminalIds: string[] }
			>();
			for (const workspace of workspaces) {
				try {
					const { sessions } = await client.terminal.listSessions.query({
						workspaceId: workspace.id,
					});
					const live = sessions
						.filter((session) => !session.exited)
						.map((session) => session.terminalId);
					if (live.length > 0) {
						byWorkspace.set(workspace.id, {
							name: workspace.name,
							terminalIds: live,
						});
					}
				} catch (error) {
					// A host that can't answer shouldn't block the move; the worst
					// case is a quieter warning and no terminals queued back.
					console.warn(
						"[move-project] terminal list failed",
						workspace.id,
						error,
					);
				}
			}
			return byWorkspace;
		},
		[],
	);

	/** Pre-flight for the confirmation dialog — no writes. */
	const getMoveImpact = useCallback(
		async (projectId: string): Promise<MoveImpact> => {
			const hostUrl = activeHostUrl ?? (await waitForHostReady());
			if (!hostUrl) return { terminalCount: 0, workspaceBreakdown: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			const workspaces = (await client.workspace.list.query()).filter(
				(workspace) => workspace.projectId === projectId,
			);
			const live = await collectLiveTerminals(hostUrl, workspaces);
			return {
				terminalCount: [...live.values()].reduce(
					(total, entry) => total + entry.terminalIds.length,
					0,
				),
				workspaceBreakdown: [...live.values()].map((entry) => ({
					name: entry.name,
					terminalCount: entry.terminalIds.length,
				})),
			};
		},
		[activeHostUrl, collectLiveTerminals, waitForHostReady],
	);

	const moveProjectToOrganization = useCallback(
		async ({
			projectId,
			targetOrganizationId,
		}: MoveProjectToOrganizationArgs): Promise<MoveProjectToOrganizationResult> => {
			if (targetOrganizationId === activeOrganizationId) {
				throw new Error("That project is already in this organization.");
			}

			setIsMoving(true);
			try {
				const sourceHostUrl = activeHostUrl ?? (await waitForHostReady());
				if (!sourceHostUrl) {
					throw new Error("The local host service isn't running.");
				}
				const sourceClient = getHostServiceClientByUrl(sourceHostUrl);

				const project = await sourceClient.project.get.query({ projectId });
				if (!project) {
					throw new Error("That project isn't set up on this device.");
				}
				const allWorkspaces = await sourceClient.workspace.list.query();
				const projectWorkspaces = allWorkspaces.filter(
					(workspace) => workspace.projectId === projectId,
				);

				// Read the live sessions BEFORE the destination host starts or the
				// source is detached — after that they're gone and unknowable.
				const liveTerminals = await collectLiveTerminals(
					sourceHostUrl,
					projectWorkspaces,
				);

				const targetHostUrl = await waitForTargetHost(targetOrganizationId);
				const targetClient = getHostServiceClientByUrl(targetHostUrl);

				// Nothing has changed yet — the destination host is running but
				// holds no rows. Anything that throws before the source is
				// detached leaves the project exactly where it started.
				let targetSetupSucceeded = false;
				const unwindDestination = async (cause: unknown): Promise<never> => {
					// `project.setup` may already have run, leaving the destination
					// host registered for a project that still belongs to the source.
					// Drop it — detach touches rows only, so the worktrees are
					// untouched either way.
					if (targetSetupSucceeded) {
						try {
							await targetClient.project.detach.mutate({ projectId });
						} catch (detachError) {
							console.error(
								"[move-project] failed to unwind destination setup",
								detachError,
							);
						}
					}
					throw cause;
				};

				// `origin` supplies the repo coordinates directly, so the host
				// never asks the cloud who owns this project — which org holds it
				// is decided by which host database has the row.
				// `mainWorkspaceId` keeps the repo's own checkout on the id it
				// already had — without it setup mints a new one and every piece
				// of local state keyed to the old id (pane layout, pins) is
				// stranded, along with its cloud row.
				const mainWorkspaceId = projectWorkspaces.find(
					(workspace) => workspace.type === "main",
				)?.id;
				try {
					await targetClient.project.setup.mutate({
						projectId,
						...(mainWorkspaceId ? { mainWorkspaceId } : {}),
						origin: { repoCloneUrl: project.repoUrl, name: project.name },
						mode: { kind: "import", repoPath: project.repoPath },
					});
					targetSetupSucceeded = true;

					// Per-project settings `project.setup` doesn't carry over.
					if (project.worktreeBaseDir) {
						await targetClient.project.setWorktreeBaseDir.mutate({
							projectId,
							path: project.worktreeBaseDir,
						});
					}
					if (project.branchPrefixMode) {
						await targetClient.project.setBranchPrefix.mutate({
							projectId,
							mode: project.branchPrefixMode,
							customPrefix: project.branchPrefixCustom ?? undefined,
						});
					}
				} catch (error) {
					await unwindDestination(error);
				}

				// Adopt each worktree in place, keeping its id and path. One that
				// can't be adopted (branch gone, path moved) must not strand the
				// rest of the move — it's reported instead.
				const skippedWorkspaces: string[] = [];
				for (const workspace of projectWorkspaces) {
					if (workspace.type !== "worktree") continue;
					try {
						await targetClient.workspaceCreation.adopt.mutate({
							projectId,
							existingWorkspaceId: workspace.id,
							workspaceName: workspace.name,
							branch: workspace.branch,
							worktreePath: workspace.worktreePath,
						});
					} catch (error) {
						console.error(
							"[move-project] failed to adopt worktree",
							workspace.id,
							error,
						);
						skippedWorkspaces.push(workspace.name);
					}
				}

				// Past this point the project is live in the destination — host
				// registered, worktrees adopted. What is left is
				// tidying the source, so a failure here is not worth unwinding a
				// good move; it leaves the project listed in both orgs, and the
				// error has to say that rather than read like the move failed.
				try {
					// The target org's local rows must exist before anything is
					// written into them — these are plain localStorage collections
					// with no rollback, so a torn write would persist.
					const targetCollections = getCollections(targetOrganizationId);
					await preloadCollections(targetOrganizationId);
					// Queue the same shells to re-open at the workspace's own
					// directory. Fresh terminal ids: the destination daemon has its
					// own id space, and `createSession` is idempotent by id.
					const terminalsToReopen = new Map(
						[...liveTerminals].map(([workspaceId, entry]) => [
							workspaceId,
							entry.terminalIds.map(() => ({
								terminalId: crypto.randomUUID(),
								cwd: null,
							})),
						]),
					);
					applyProjectSidebarState(
						targetCollections,
						projectId,
						collectProjectSidebarState(collections, projectId),
						terminalsToReopen,
					);

					// Leave the workspace route before its local state disappears,
					// otherwise the open panes are wiped in place.
					for (const workspace of projectWorkspaces) {
						navigateAwayFromWorkspace(workspace.id);
					}

					// Detach first: the host database is what decides the org owns
					// this project, and if it throws the sidebar row is still there
					// — which is exactly the remnant the error below tells the user
					// to clear. Removing the row first would take away the only
					// thing they could act on.
					await sourceClient.project.detach.mutate({ projectId });
					removeProjectFromSidebar(projectId);
				} catch (error) {
					console.error("[move-project] cleanup after the move failed", error);
					throw new Error(
						`${project.name} moved successfully, but clearing it out of the old organization didn't finish, so it may still be listed there. Remove it from the old organization's sidebar. Details: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}

				// The project list polls its hosts on a 30s fallback interval, so
				// without this the moved project takes up to half a minute to
				// appear in the destination (and to leave the source).
				void queryClient.invalidateQueries({
					queryKey: ["host-service", "projects", "list"],
				});
				void queryClient.invalidateQueries({
					queryKey: ["host-service", "workspaces", "list"],
				});

				return { skippedWorkspaces };
			} finally {
				setIsMoving(false);
			}
		},
		[
			activeHostUrl,
			activeOrganizationId,
			collections,
			navigateAwayFromWorkspace,
			queryClient,
			collectLiveTerminals,
			removeProjectFromSidebar,
			waitForHostReady,
			waitForTargetHost,
		],
	);

	return { moveProjectToOrganization, getMoveImpact, isMoving };
}
