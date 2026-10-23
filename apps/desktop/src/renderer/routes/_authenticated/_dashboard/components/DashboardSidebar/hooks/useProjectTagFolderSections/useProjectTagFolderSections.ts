import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTagFolderWorkspaces } from "renderer/routes/_authenticated/providers/TagFolderWorkspacesProvider";
import {
	deriveSessionTagFolders,
	deriveTagFolders,
	useTagFolderContext,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";

export interface ProjectTagFolderSection {
	id: string;
	name: string;
	color: string | null;
}

/**
 * A project's folder list for menus ("Move to group" etc.) — the
 * deriveTagFolders union, NOT the stored rows: a folder that exists only
 * because a workspace carries the tag must be a valid move target, or
 * agent-created folders can't be targeted at all.
 */
export function useProjectTagFolderSections(projectId: string | null): {
	sections: ProjectTagFolderSection[];
	areSectionsReady: boolean;
} {
	const collections = useCollections();
	const { workspaces, isReady: workspacesReady } = useTagFolderWorkspaces();
	const tagFolderContext = useTagFolderContext();
	const { data: storedSections = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					createdAt: sidebarSections.createdAt,
					isCollapsed: sidebarSections.isCollapsed,
					tabOrder: sidebarSections.tabOrder,
					color: sidebarSections.color,
					tag: sidebarSections.tag,
					materializedByInteraction: sidebarSections.materializedByInteraction,
				})),
		[collections],
	);
	const sections = useMemo(() => {
		if (projectId === null) {
			return deriveSessionTagFolders(
				workspaces,
				tagFolderContext.tagSettings,
			).map(({ tag, name, color }) => ({ id: tag, name, color }));
		}
		return deriveTagFolders(storedSections, workspaces, tagFolderContext)
			.filter((section) => section.projectId === projectId)
			.sort(
				(left, right) =>
					left.tabOrder - right.tabOrder ||
					left.sectionId.localeCompare(right.sectionId),
			)
			.map((section) => ({
				id: section.sectionId,
				name: section.name,
				color: section.color,
			}));
	}, [projectId, storedSections, workspaces, tagFolderContext]);
	// Derived folders come from these rows, so "ready" waits for the host
	// fan-out and the cloud list — otherwise the menu claims a complete list
	// before tags arrive.
	return { sections, areSectionsReady: isReady && workspacesReady };
}
