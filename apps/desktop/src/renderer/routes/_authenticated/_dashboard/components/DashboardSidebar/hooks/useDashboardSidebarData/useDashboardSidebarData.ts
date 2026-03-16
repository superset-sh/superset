import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	DashboardSidebarProject,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

export function useDashboardSidebarData() {
	const collections = useCollections();
	const { toggleProjectCollapsed } = useDashboardSidebarState();

	const { data: sidebarProjects = [] } = useLiveQuery(
		(q) => q.from({ sidebarProjects: collections.v2SidebarProjects }),
		[collections],
	);

	const { data: sidebarWorkspaces = [] } = useLiveQuery(
		(q) => q.from({ sidebarWorkspaces: collections.v2SidebarWorkspaces }),
		[collections],
	);

	const { data: sidebarSections = [] } = useLiveQuery(
		(q) => q.from({ sidebarSections: collections.v2SidebarSections }),
		[collections],
	);

	const { data: projects = [] } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const { data: workspaces = [] } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);

	const { data: githubRepos = [] } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
			})),
		[collections],
	);

	const groups = useMemo<DashboardSidebarProject[]>(() => {
		const repoOwnerMap = new Map<string, string>();
		for (const repo of githubRepos) {
			repoOwnerMap.set(repo.id, repo.owner);
		}

		const cloudProjectsById = new Map(
			projects.map((project) => [project.id, project]),
		);
		const cloudWorkspacesById = new Map(
			workspaces.map((workspace) => [workspace.id, workspace]),
		);

		const localSectionsByProject = new Map<string, DashboardSidebarSection[]>();
		for (const section of sidebarSections) {
			const sectionsForProject =
				localSectionsByProject.get(section.projectId) ?? [];
			sectionsForProject.push({
				id: section.sectionId,
				projectId: section.projectId,
				name: section.name,
				createdAt: section.createdAt,
				isCollapsed: section.isCollapsed,
				tabOrder: section.tabOrder,
				workspaces: [],
			});
			localSectionsByProject.set(section.projectId, sectionsForProject);
		}

		for (const sections of localSectionsByProject.values()) {
			sections.sort(
				(a, b) => a.tabOrder - b.tabOrder || a.name.localeCompare(b.name),
			);
		}

		const workspaceRowsByProject = new Map<
			string,
			DashboardSidebarWorkspace[]
		>();
		const workspaceRowsBySection = new Map<
			string,
			DashboardSidebarWorkspace[]
		>();

		for (const localWorkspace of sidebarWorkspaces) {
			const workspace = cloudWorkspacesById.get(localWorkspace.workspaceId);
			if (!workspace) continue;

			const sidebarWorkspace: DashboardSidebarWorkspace = {
				id: workspace.id,
				projectId: workspace.projectId,
				deviceId: workspace.deviceId,
				name: workspace.name,
				branch: workspace.branch,
				createdAt: workspace.createdAt,
				updatedAt: workspace.updatedAt,
			};

			if (localWorkspace.sectionId) {
				const sectionWorkspaces =
					workspaceRowsBySection.get(localWorkspace.sectionId) ?? [];
				sectionWorkspaces.push(sidebarWorkspace);
				workspaceRowsBySection.set(localWorkspace.sectionId, sectionWorkspaces);
				continue;
			}

			const projectWorkspaces =
				workspaceRowsByProject.get(localWorkspace.projectId) ?? [];
			projectWorkspaces.push(sidebarWorkspace);
			workspaceRowsByProject.set(localWorkspace.projectId, projectWorkspaces);
		}

		const localWorkspaceOrder = new Map(
			sidebarWorkspaces.map((workspace) => [
				workspace.workspaceId,
				workspace.tabOrder,
			]),
		);

		for (const rows of workspaceRowsByProject.values()) {
			rows.sort(
				(a, b) =>
					(localWorkspaceOrder.get(a.id) ?? 0) -
						(localWorkspaceOrder.get(b.id) ?? 0) ||
					a.name.localeCompare(b.name),
			);
		}

		for (const rows of workspaceRowsBySection.values()) {
			rows.sort(
				(a, b) =>
					(localWorkspaceOrder.get(a.id) ?? 0) -
						(localWorkspaceOrder.get(b.id) ?? 0) ||
					a.name.localeCompare(b.name),
			);
		}

		const resolvedProjects: DashboardSidebarProject[] = [];

		for (const localProject of [...sidebarProjects].sort(
			(a, b) => a.tabOrder - b.tabOrder,
		)) {
			const project = cloudProjectsById.get(localProject.projectId);
			if (!project) continue;

			const projectSections = (
				localSectionsByProject.get(project.id) ?? []
			).map((section) => ({
				...section,
				workspaces: workspaceRowsBySection.get(section.id) ?? [],
			}));

			const repoId = project.githubRepositoryId ?? null;

			resolvedProjects.push({
				id: project.id,
				name: project.name,
				slug: project.slug,
				githubRepositoryId: repoId,
				githubOwner: repoId ? (repoOwnerMap.get(repoId) ?? null) : null,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
				isCollapsed: localProject.isCollapsed,
				workspaces: workspaceRowsByProject.get(project.id) ?? [],
				sections: projectSections,
			});
		}

		return resolvedProjects;
	}, [
		githubRepos,
		projects,
		sidebarProjects,
		sidebarSections,
		sidebarWorkspaces,
		workspaces,
	]);

	return {
		groups,
		toggleProjectCollapsed,
	};
}
