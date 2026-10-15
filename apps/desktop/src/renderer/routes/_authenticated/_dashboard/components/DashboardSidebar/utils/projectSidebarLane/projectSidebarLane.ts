import type { DashboardSidebarProject } from "../../types";

export interface ProjectSidebarSection {
	id: string;
	name: string;
	color: string | null;
	isCollapsed: boolean;
	/** The filter shows it open, so collapsing it is off until that clears. */
	isCollapseLocked: boolean;
	/** Projects shown in it right now (the filter can hide some). */
	projectCount: number;
}

export type ProjectSidebarLaneItem =
	| { type: "section"; section: ProjectSidebarSection }
	| {
			type: "project";
			project: DashboardSidebarProject;
			/** The section the project is filed under, or null at the top level. */
			section: ProjectSidebarSection | null;
	  };

export interface ProjectSectionInput {
	sectionId: string;
	name: string;
	color: string | null;
	isCollapsed: boolean;
	tabOrder: number;
}

export interface ProjectPlacementInput {
	projectId: string;
	tabOrder: number;
	sectionId: string | null;
}

type LaneEntry =
	| { type: "section"; id: string; tabOrder: number }
	| { type: "project"; id: string; tabOrder: number };

function compareLaneEntries(left: LaneEntry, right: LaneEntry): number {
	return (
		left.tabOrder - right.tabOrder ||
		(left.type === right.type ? 0 : left.type === "section" ? -1 : 1) ||
		left.id.localeCompare(right.id)
	);
}

/**
 * The Projects list in render order: top-level projects and sections
 * interleave by tabOrder, and each section is followed by its projects. A
 * project pointing at a missing section renders at the top level.
 *
 * `hideEmptySections` is for a filtered view: a section none of whose
 * projects match is dropped, and the rest show expanded so matches are seen.
 */
export function buildProjectSidebarLane({
	projects,
	sections,
	placements,
	hideEmptySections = false,
}: {
	projects: readonly DashboardSidebarProject[];
	sections: readonly ProjectSectionInput[];
	placements: readonly ProjectPlacementInput[];
	hideEmptySections?: boolean;
}): ProjectSidebarLaneItem[] {
	const placementByProjectId = new Map(
		placements.map((placement) => [placement.projectId, placement]),
	);
	const sectionIds = new Set(sections.map((section) => section.sectionId));
	const projectsBySectionId = new Map<string, DashboardSidebarProject[]>();
	const entries: LaneEntry[] = sections.map((section) => ({
		type: "section",
		id: section.sectionId,
		tabOrder: section.tabOrder,
	}));
	const projectsById = new Map<string, DashboardSidebarProject>();

	projects.forEach((project, index) => {
		projectsById.set(project.id, project);
		const placement = placementByProjectId.get(project.id);
		const sectionId =
			placement?.sectionId != null && sectionIds.has(placement.sectionId)
				? placement.sectionId
				: null;
		if (sectionId === null) {
			entries.push({
				type: "project",
				id: project.id,
				tabOrder: placement?.tabOrder ?? index,
			});
			return;
		}
		const members = projectsBySectionId.get(sectionId);
		if (members) members.push(project);
		else projectsBySectionId.set(sectionId, [project]);
	});

	const tabOrderOf = (project: DashboardSidebarProject) =>
		placementByProjectId.get(project.id)?.tabOrder ?? 0;
	const sectionInputById = new Map(
		sections.map((section) => [section.sectionId, section]),
	);
	const lane: ProjectSidebarLaneItem[] = [];
	for (const entry of entries.sort(compareLaneEntries)) {
		if (entry.type === "project") {
			const project = projectsById.get(entry.id);
			if (project) lane.push({ type: "project", project, section: null });
			continue;
		}
		const input = sectionInputById.get(entry.id);
		if (!input) continue;
		const members = [...(projectsBySectionId.get(entry.id) ?? [])].sort(
			(left, right) =>
				tabOrderOf(left) - tabOrderOf(right) || left.id.localeCompare(right.id),
		);
		if (hideEmptySections && members.length === 0) continue;
		const section: ProjectSidebarSection = {
			id: input.sectionId,
			name: input.name,
			color: input.color,
			isCollapsed: hideEmptySections ? false : input.isCollapsed,
			isCollapseLocked: hideEmptySections,
			projectCount: members.length,
		};
		lane.push({ type: "section", section });
		for (const project of members) {
			lane.push({ type: "project", project, section });
		}
	}
	return lane;
}

/** One stored row of the lane, as the write planner sees it. */
export type StoredLaneEntry =
	| { type: "section"; id: string }
	| { type: "project"; id: string; sectionId: string | null };

/**
 * Every stored row (hidden projects included, so they keep their place) in
 * render order: the same layout {@link buildProjectSidebarLane} draws.
 */
export function getStoredProjectLane(
	placements: readonly ProjectPlacementInput[],
	sections: readonly ProjectSectionInput[],
): StoredLaneEntry[] {
	const sectionIds = new Set(sections.map((section) => section.sectionId));
	const membersBySectionId = new Map<string, ProjectPlacementInput[]>();
	const entries: LaneEntry[] = sections.map((section) => ({
		type: "section",
		id: section.sectionId,
		tabOrder: section.tabOrder,
	}));
	for (const placement of placements) {
		if (placement.sectionId != null && sectionIds.has(placement.sectionId)) {
			const members = membersBySectionId.get(placement.sectionId);
			if (members) members.push(placement);
			else membersBySectionId.set(placement.sectionId, [placement]);
			continue;
		}
		entries.push({
			type: "project",
			id: placement.projectId,
			tabOrder: placement.tabOrder,
		});
	}
	return entries
		.sort(compareLaneEntries)
		.flatMap((entry): StoredLaneEntry[] => {
			if (entry.type === "project") {
				return [{ type: "project", id: entry.id, sectionId: null }];
			}
			const members = [...(membersBySectionId.get(entry.id) ?? [])].sort(
				(left, right) =>
					left.tabOrder - right.tabOrder ||
					left.projectId.localeCompare(right.projectId),
			);
			return [
				{ type: "section", id: entry.id },
				...members.map((member) => ({
					type: "project" as const,
					id: member.projectId,
					sectionId: entry.id,
				})),
			];
		});
}

/**
 * The stored lane with its visible rows put in `visible`'s order. Rows the
 * view hides keep their slots, so a drag never moves them.
 */
export function mergeVisibleLane(
	stored: readonly StoredLaneEntry[],
	visible: readonly StoredLaneEntry[],
): StoredLaneEntry[] {
	const keyOf = (entry: StoredLaneEntry) => `${entry.type}:${entry.id}`;
	const storedKeys = new Set(stored.map(keyOf));
	const placed = visible.filter((entry) => storedKeys.has(keyOf(entry)));
	const placedKeys = new Set(placed.map(keyOf));
	let next = 0;
	return stored.map((entry) =>
		placedKeys.has(keyOf(entry)) ? (placed[next++] ?? entry) : entry,
	);
}

/** Index just past a section's last project (or its header when empty). */
function getSectionBlockEnd(
	lane: StoredLaneEntry[],
	sectionId: string,
): number {
	const start = lane.findIndex(
		(entry) => entry.type === "section" && entry.id === sectionId,
	);
	if (start === -1) return -1;
	let end = start + 1;
	while (
		end < lane.length &&
		lane[end]?.type === "project" &&
		(lane[end] as { sectionId: string | null }).sectionId === sectionId
	) {
		end += 1;
	}
	return end;
}

/**
 * The lane with `projectId` moved into `sectionId` (as its last project),
 * or, for null, out to the top level right below the section it left.
 */
export function moveProjectInLane(
	lane: readonly StoredLaneEntry[],
	projectId: string,
	sectionId: string | null,
): StoredLaneEntry[] {
	const current = lane.find(
		(entry) => entry.type === "project" && entry.id === projectId,
	);
	if (!current || current.type !== "project") return [...lane];
	if (current.sectionId === sectionId) return [...lane];
	const rest = lane.filter((entry) => entry !== current);
	const anchorSectionId = sectionId ?? current.sectionId;
	const insertAt =
		anchorSectionId === null ? -1 : getSectionBlockEnd(rest, anchorSectionId);
	const moved: StoredLaneEntry = { type: "project", id: projectId, sectionId };
	if (insertAt === -1) return [...lane];
	return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
}

/**
 * The lane with a new section that takes `fromProjectId`'s place (below its
 * old section when it had one) and holds it.
 */
export function insertSectionInLane(
	lane: readonly StoredLaneEntry[],
	sectionId: string,
	fromProjectId: string,
): StoredLaneEntry[] {
	const header: StoredLaneEntry = { type: "section", id: sectionId };
	const source = lane.find(
		(entry) => entry.type === "project" && entry.id === fromProjectId,
	);
	if (!source || source.type !== "project") return [header, ...lane];
	const rest = lane.filter((entry) => entry !== source);
	const insertAt =
		source.sectionId === null
			? lane.indexOf(source)
			: getSectionBlockEnd(rest, source.sectionId);
	return [
		...rest.slice(0, insertAt),
		header,
		{ type: "project", id: source.id, sectionId },
		...rest.slice(insertAt),
	];
}

/** The lane without a section; its projects stay in place at the top level. */
export function removeSectionFromLane(
	lane: readonly StoredLaneEntry[],
	sectionId: string,
): StoredLaneEntry[] {
	return lane.flatMap((entry): StoredLaneEntry[] => {
		if (entry.type === "section") return entry.id === sectionId ? [] : [entry];
		return entry.sectionId === sectionId
			? [{ ...entry, sectionId: null }]
			: [entry];
	});
}
