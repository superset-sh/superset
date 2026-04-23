import type { WorkspaceState } from "@superset/panes";
import type { OrgCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { computeNormalizedOrders } from "./normalize";

const EMPTY_PANE_LAYOUT = {
	version: 1,
	tabs: [],
	activeTabId: null,
} satisfies WorkspaceState<unknown>;

/**
 * v1 project row shape consumed by sidebar translation. Structural so callers
 * can pass drizzle rows without coupling.
 */
export interface V1ProjectLike {
	id: string;
	tabOrder: number | null;
	defaultApp: string | null;
}

export interface V1SectionLike {
	id: string;
	projectId: string;
	name: string;
	tabOrder: number;
	isCollapsed: boolean | null;
	color: string | null;
}

export interface V1WorkspaceLike {
	id: string;
	projectId: string;
	sectionId: string | null;
	tabOrder: number;
}

export interface SidebarInput {
	/** v1 project id → v2 project id, for projects that successfully migrated. */
	projectV1ToV2: Map<string, string>;
	/** v1 workspace id → v2 workspace id, for workspaces that successfully adopted. */
	workspaceV1ToV2: Map<string, string>;
	v1Projects: V1ProjectLike[];
	v1Sections: V1SectionLike[];
	v1Workspaces: V1WorkspaceLike[];
}

/**
 * Translates v1 sidebar state (project order, sections, workspace order +
 * section membership) into the three v2 collections that back the dashboard
 * sidebar. Single entry point so the main migration loop only deals with
 * cloud/host-service creates; all renderer-side collection writes live here.
 *
 * Tab orders are normalized via computeNormalizedOrders so top-level
 * workspaces always sort before sections in v2 (v2 absorbs post-section
 * top-level workspaces into the preceding section at render time — see
 * useDashboardSidebarData.ts:343-357).
 *
 * Idempotent: each write checks collection.get(id) first, so rerunning over
 * an already-populated sidebar is a no-op.
 */
export function writeV2SidebarState(
	collections: OrgCollections,
	input: SidebarInput,
): void {
	const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
		workspaces: input.v1Workspaces.map((w) => ({
			id: w.id,
			projectId: w.projectId,
			sectionId: w.sectionId,
			tabOrder: w.tabOrder,
		})),
		sections: input.v1Sections.map((s) => ({
			id: s.id,
			projectId: s.projectId,
			tabOrder: s.tabOrder,
		})),
	});

	// 1. Projects: write per-project sidebar meta (pin order + default app).
	const v1ProjectsById = new Map(input.v1Projects.map((p) => [p.id, p]));
	for (const [v1ProjectId, v2ProjectId] of input.projectV1ToV2) {
		if (collections.v2SidebarProjects.get(v2ProjectId)) continue;
		const v1Project = v1ProjectsById.get(v1ProjectId);
		collections.v2SidebarProjects.insert({
			projectId: v2ProjectId,
			createdAt: new Date(),
			isCollapsed: false,
			tabOrder: v1Project?.tabOrder ?? 0,
			defaultOpenInApp: v1Project?.defaultApp ?? null,
		});
	}

	// 2. Sections: create v2 sections for every v1 section under a migrated
	//    project. Reuse the v1 section id (already a UUID) as the v2 section
	//    id — deterministic mapping makes reruns idempotent and lets the
	//    `get(id)` guard actually dedup. Empty sections are preserved — v1
	//    supports them as an organizational primitive and the user may have
	//    intentionally created one ahead of filling it.
	const sectionV1ToV2 = new Map<string, string>();
	for (const v1Section of input.v1Sections) {
		const v2ProjectId = input.projectV1ToV2.get(v1Section.projectId);
		if (!v2ProjectId) continue;
		const v2SectionId = v1Section.id;
		sectionV1ToV2.set(v1Section.id, v2SectionId);
		if (collections.v2SidebarSections.get(v2SectionId)) continue;
		collections.v2SidebarSections.insert({
			sectionId: v2SectionId,
			projectId: v2ProjectId,
			name: v1Section.name,
			createdAt: new Date(),
			tabOrder: sectionTabOrder.get(v1Section.id) ?? v1Section.tabOrder,
			isCollapsed: v1Section.isCollapsed ?? false,
			color: v1Section.color ?? null,
		});
	}

	// 3. Workspaces: per-workspace sidebar state (tab order + section
	//    membership + empty pane layout). Only adopted workspaces are
	//    included — skipped/errored workspaces have no v2 counterpart.
	const v1WorkspacesById = new Map(input.v1Workspaces.map((w) => [w.id, w]));
	for (const [v1WorkspaceId, v2WorkspaceId] of input.workspaceV1ToV2) {
		if (collections.v2WorkspaceLocalState.get(v2WorkspaceId)) continue;
		const v1Workspace = v1WorkspacesById.get(v1WorkspaceId);
		if (!v1Workspace) continue;
		const v2ProjectId = input.projectV1ToV2.get(v1Workspace.projectId);
		if (!v2ProjectId) continue;
		const v2SectionId = v1Workspace.sectionId
			? (sectionV1ToV2.get(v1Workspace.sectionId) ?? null)
			: null;
		collections.v2WorkspaceLocalState.insert({
			workspaceId: v2WorkspaceId,
			createdAt: new Date(),
			sidebarState: {
				projectId: v2ProjectId,
				tabOrder: workspaceTabOrder.get(v1WorkspaceId) ?? v1Workspace.tabOrder,
				sectionId: v2SectionId,
				changesFilter: { kind: "all" },
				changesSubtab: "diffs",
			},
			paneLayout: EMPTY_PANE_LAYOUT,
			viewedFiles: [],
			recentlyViewedFiles: [],
		});
	}
}
