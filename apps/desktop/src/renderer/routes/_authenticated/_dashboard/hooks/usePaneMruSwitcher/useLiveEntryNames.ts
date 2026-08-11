import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { PaneMruEntry } from "renderer/stores/pane-mru";
import { useDashboardSidebarData } from "../../components/DashboardSidebar/hooks/useDashboardSidebarData";
import type { PullRequestState } from "../../components/PullRequestStateIcon";

/**
 * Refresh the workspace and project names on MRU entries from current data.
 *
 * Pane labels have to be snapshotted at record time — resolving one needs that
 * workspace's live pane store and registry, which only exist while it is
 * mounted. Workspace and project names are different: both are readable for
 * EVERY workspace from here, so snapshotting them just meant a rename never
 * reached rows recorded before it. Resolve them live and fall back to the
 * recorded value for anything no longer present.
 */
export function useLiveEntryNames(): (entry: PaneMruEntry) => PaneMruEntry {
	const { workspaces } = useHostWorkspaces();
	// Same query keys the sidebar already uses, so react-query serves these
	// from cache rather than polling a second time.
	const { groups } = useDashboardSidebarData();
	// Projects are served by host-service, not Electric — the `projects`
	// collection stays empty in practice. This is the same source the sidebar
	// reads, so the switcher shows exactly the names shown there.
	const { projects } = useHostProjects();

	const pullRequestsByWorkspaceId = useMemo(() => {
		const map = new Map<
			string,
			{ state: PullRequestState; number: number } | null
		>();
		for (const project of groups) {
			for (const child of project.children) {
				const childWorkspaces =
					child.type === "workspace"
						? [child.workspace]
						: child.section.workspaces;
				for (const workspace of childWorkspaces) {
					const pr = workspace.pullRequest;
					map.set(
						workspace.id,
						pr ? { state: pr.state, number: pr.number } : null,
					);
				}
			}
		}
		return map;
	}, [groups]);

	const namesByWorkspaceId = useMemo(() => {
		const projectsById = new Map(
			projects.map((project) => [project.id, project] as const),
		);

		const map = new Map<
			string,
			{
				workspaceName: string;
				projectName?: string;
				projectIconUrl?: string | null;
			}
		>();
		for (const workspace of workspaces) {
			const project = workspace.projectId
				? projectsById.get(workspace.projectId)
				: undefined;
			map.set(workspace.id, {
				// `name` can be empty; the sidebar falls back to the branch.
				workspaceName: workspace.name || workspace.branch,
				projectName: project?.name,
				// Same derivation the sidebar uses, so both show one image. Null
				// for projects with no GitHub owner (purely local repos).
				projectIconUrl: project?.repoOwner
					? `https://github.com/${project.repoOwner}.png?size=64`
					: null,
			});
		}
		return map;
	}, [workspaces, projects]);

	return useMemo(
		() => (entry: PaneMruEntry) => {
			const live = namesByWorkspaceId.get(entry.workspaceId);
			const pr = pullRequestsByWorkspaceId.get(entry.workspaceId) ?? null;
			if (!live) return entry;
			if (
				live.workspaceName === entry.workspaceName &&
				live.projectName === entry.projectName &&
				live.projectIconUrl === entry.projectIconUrl &&
				(pr?.state ?? null) === (entry.pullRequestState ?? null) &&
				pr?.number === entry.pullRequestNumber
			) {
				return entry;
			}
			return {
				...entry,
				workspaceName: live.workspaceName,
				projectName: live.projectName ?? entry.projectName,
				projectIconUrl: live.projectIconUrl,
				pullRequestState: pr?.state ?? null,
				pullRequestNumber: pr?.number,
			};
		},
		[namesByWorkspaceId, pullRequestsByWorkspaceId],
	);
}
