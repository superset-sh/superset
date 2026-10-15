import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getPrependTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	getStoredProjectLane,
	insertSectionInLane,
	mergeVisibleLane,
	moveProjectInLane,
	removeSectionFromLane,
	type StoredLaneEntry,
} from "../../utils/projectSidebarLane";

/** Mutations for the Projects list's sections; all per device. */
export function useProjectSidebarSections() {
	const { t } = useLingui();
	const collections = useCollections();

	const readLane = useCallback(
		() =>
			getStoredProjectLane(
				Array.from(collections.v2SidebarProjects.state.values()).map((row) => ({
					projectId: row.projectId,
					tabOrder: row.tabOrder,
					sectionId: row.sectionId,
				})),
				Array.from(collections.v2SidebarProjectSections.state.values()),
			),
		[collections],
	);

	/** Renumbers the lane in order: one write per collection, changed rows only. */
	const writeLane = useCallback(
		(lane: readonly StoredLaneEntry[]) => {
			const sectionOrders = new Map<string, number>();
			const projectPlacements = new Map<
				string,
				{ tabOrder: number; sectionId: string | null }
			>();
			lane.forEach((entry, index) => {
				const tabOrder = index + 1;
				if (entry.type === "section") {
					const row = collections.v2SidebarProjectSections.get(entry.id);
					if (row && row.tabOrder !== tabOrder) {
						sectionOrders.set(entry.id, tabOrder);
					}
					return;
				}
				const row = collections.v2SidebarProjects.get(entry.id);
				if (
					row &&
					(row.tabOrder !== tabOrder || row.sectionId !== entry.sectionId)
				) {
					projectPlacements.set(entry.id, {
						tabOrder,
						sectionId: entry.sectionId,
					});
				}
			});
			if (sectionOrders.size > 0) {
				collections.v2SidebarProjectSections.update(
					[...sectionOrders.keys()],
					(drafts) => {
						for (const draft of drafts) {
							draft.tabOrder =
								sectionOrders.get(draft.sectionId) ?? draft.tabOrder;
						}
					},
				);
			}
			if (projectPlacements.size > 0) {
				collections.v2SidebarProjects.update(
					[...projectPlacements.keys()],
					(drafts) => {
						for (const draft of drafts) {
							const placement = projectPlacements.get(draft.projectId);
							if (!placement) continue;
							draft.tabOrder = placement.tabOrder;
							draft.sectionId = placement.sectionId;
						}
					},
				);
			}
		},
		[collections],
	);

	const expandProjectSection = useCallback(
		(sectionId: string) => {
			if (!collections.v2SidebarProjectSections.get(sectionId)?.isCollapsed) {
				return;
			}
			collections.v2SidebarProjectSections.update(sectionId, (draft) => {
				draft.isCollapsed = false;
			});
		},
		[collections],
	);

	const createProjectSection = useCallback(
		(options: { name?: string; fromProjectId?: string } = {}) => {
			const { name = t({ message: "New section" }), fromProjectId } = options;
			const sectionId = crypto.randomUUID();
			const row = {
				sectionId,
				name,
				createdAt: new Date(),
				isCollapsed: false,
				color: null,
			};
			if (!fromProjectId) {
				collections.v2SidebarProjectSections.insert({
					...row,
					tabOrder: getPrependTabOrder([
						...collections.v2SidebarProjectSections.state.values(),
						...collections.v2SidebarProjects.state.values(),
					]),
				});
				return sectionId;
			}
			const lane = insertSectionInLane(readLane(), sectionId, fromProjectId);
			collections.v2SidebarProjectSections.insert({ ...row, tabOrder: 0 });
			writeLane(lane);
			return sectionId;
		},
		[collections, readLane, t, writeLane],
	);

	const renameProjectSection = useCallback(
		(sectionId: string, name: string) => {
			const trimmed = name.trim();
			if (!trimmed || !collections.v2SidebarProjectSections.get(sectionId)) {
				return;
			}
			collections.v2SidebarProjectSections.update(sectionId, (draft) => {
				draft.name = trimmed;
			});
		},
		[collections],
	);

	const setProjectSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			if (!collections.v2SidebarProjectSections.get(sectionId)) return;
			collections.v2SidebarProjectSections.update(sectionId, (draft) => {
				draft.color = color;
			});
		},
		[collections],
	);

	const toggleProjectSectionCollapsed = useCallback(
		(sectionId: string) => {
			if (!collections.v2SidebarProjectSections.get(sectionId)) return;
			collections.v2SidebarProjectSections.update(sectionId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const moveProjectToSection = useCallback(
		(projectId: string, sectionId: string | null) => {
			writeLane(moveProjectInLane(readLane(), projectId, sectionId));
			if (sectionId !== null) expandProjectSection(sectionId);
		},
		[expandProjectSection, readLane, writeLane],
	);

	/** Opens the collapsed section a project is filed under, if any. */
	const revealProject = useCallback(
		(projectId: string) => {
			const sectionId = collections.v2SidebarProjects.get(projectId)?.sectionId;
			if (sectionId) expandProjectSection(sectionId);
		},
		[collections, expandProjectSection],
	);

	const deleteProjectSection = useCallback(
		(sectionId: string) => {
			if (!collections.v2SidebarProjectSections.get(sectionId)) return;
			writeLane(removeSectionFromLane(readLane(), sectionId));
			collections.v2SidebarProjectSections.delete(sectionId);
		},
		[collections, readLane, writeLane],
	);

	/** Persists a drag of the visible lane; hidden projects keep their slots. */
	const commitProjectLane = useCallback(
		(visibleLane: readonly StoredLaneEntry[]) => {
			writeLane(mergeVisibleLane(readLane(), visibleLane));
		},
		[readLane, writeLane],
	);

	return {
		commitProjectLane,
		createProjectSection,
		deleteProjectSection,
		moveProjectToSection,
		renameProjectSection,
		revealProject,
		setProjectSectionColor,
		toggleProjectSectionCollapsed,
	};
}
