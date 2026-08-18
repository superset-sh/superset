import {
	type CollisionDetection,
	closestCenter,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	getFirstCollision,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	type UniqueIdentifier,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

// ── ID helpers ───────────────────────────────────────────────────────

const WS = "ws::";
const SEC = "sec::";
const DROP_ZONE = "dropzone::";

export const wsId = (id: string) => `${WS}${id}`;
export const secId = (id: string) => `${SEC}${id}`;
export const isSec = (id: UniqueIdentifier) => String(id).startsWith(SEC);

export const parseId = (id: UniqueIdentifier) => {
	const s = String(id);
	if (s.startsWith(WS))
		return { type: "workspace" as const, realId: s.slice(WS.length) };
	if (s.startsWith(SEC))
		return { type: "section" as const, realId: s.slice(SEC.length) };
	return null;
};

// ── Containers ───────────────────────────────────────────────────────
//
// Every workspace row lives in exactly one container: the top-level Pinned
// section, the top-level Sessions section, or its project's list. All rows
// share one DndContext so drags can cross the pin boundary; a container-level
// "drop zone" droppable stands in for containers that have no rows to target.

export const PINNED_CONTAINER = "pinned";
export const SESSIONS_CONTAINER = "sessions";

export const dropZoneId = (container: string) => `${DROP_ZONE}${container}`;
const parseDropZoneId = (id: UniqueIdentifier): string | null => {
	const s = String(id);
	return s.startsWith(DROP_ZONE) ? s.slice(DROP_ZONE.length) : null;
};

interface SidebarDndItems {
	pinned: UniqueIdentifier[];
	sessions: UniqueIdentifier[];
	byProject: Record<string, UniqueIdentifier[]>;
	/**
	 * Explicit section membership: flat workspace id → flat section id.
	 * Membership is NOT positional — an ungrouped row may sit below a section
	 * (groups reorder like any other top-level item), so "nearest header above"
	 * can't be trusted. A row is in a section only if this map says so; drops
	 * update the dragged row's entry from its landing neighbors.
	 */
	membership: Record<string, string>;
}

/**
 * O(1) id→container lookup, rebuilt whenever the item lists change. Collision
 * detection runs on every pointer move, so linear scans over every container
 * are off the table.
 */
function buildContainerMap(
	items: SidebarDndItems,
): Map<UniqueIdentifier, string> {
	const map = new Map<UniqueIdentifier, string>();
	for (const id of items.pinned) map.set(id, PINNED_CONTAINER);
	for (const id of items.sessions) map.set(id, SESSIONS_CONTAINER);
	for (const [projectId, list] of Object.entries(items.byProject)) {
		for (const id of list) map.set(id, projectId);
	}
	return map;
}

function getContainerList(
	items: SidebarDndItems,
	container: string,
): UniqueIdentifier[] {
	if (container === PINNED_CONTAINER) return items.pinned;
	if (container === SESSIONS_CONTAINER) return items.sessions;
	return items.byProject[container] ?? [];
}

function withContainerList(
	items: SidebarDndItems,
	container: string,
	list: UniqueIdentifier[],
): SidebarDndItems {
	if (container === PINNED_CONTAINER) return { ...items, pinned: list };
	if (container === SESSIONS_CONTAINER) return { ...items, sessions: list };
	return {
		...items,
		byProject: { ...items.byProject, [container]: list },
	};
}

// ── Measuring config ─────────────────────────────────────────────────

export const measuring = {
	droppable: { strategy: MeasuringStrategy.Always as const },
};

// ── Build flat list from project children ────────────────────────────

function buildFlatItems(
	children: DashboardSidebarProjectChild[],
): UniqueIdentifier[] {
	const items: UniqueIdentifier[] = [];
	for (const child of children) {
		if (child.type === "workspace") {
			items.push(wsId(child.workspace.id));
		} else {
			items.push(secId(child.section.id));
			// Always include workspaces so AnimatePresence can animate collapse
			for (const ws of child.section.workspaces) {
				items.push(wsId(ws.id));
			}
		}
	}
	return items;
}

function collectMembership(
	children: DashboardSidebarProjectChild[],
	into: Record<string, string>,
): void {
	for (const child of children) {
		if (child.type !== "section") continue;
		for (const ws of child.section.workspaces) {
			into[wsId(ws.id)] = secId(child.section.id);
		}
	}
}

function buildMembership(
	projects: DashboardSidebarProject[],
): Record<string, string> {
	const membership: Record<string, string> = {};
	for (const project of projects) {
		collectMembership(project.children, membership);
	}
	return membership;
}

/**
 * Section the row at `id` belongs to after landing in `list`: the section of
 * the row directly above it (a header counts as its own section), or null when
 * it sits at the top / below an ungrouped row.
 */
function membershipFromNeighbors(
	list: UniqueIdentifier[],
	membership: Record<string, string>,
	id: UniqueIdentifier,
): string | null {
	const index = list.indexOf(id);
	if (index <= 0) return null;
	const above = list[index - 1];
	if (isSec(above)) return String(above);
	return membership[String(above)] ?? null;
}

// ── Parse flat list into top-level order + section membership ─────────

interface ParsedFlatItems {
	topLevel: Array<{ type: "workspace" | "section"; id: string }>;
	sections: Record<string, string[]>;
}

function parseFlatItems(
	items: UniqueIdentifier[],
	membership: Record<string, string>,
): ParsedFlatItems {
	const result: ParsedFlatItems = { topLevel: [], sections: {} };

	for (const id of items) {
		const parsed = parseId(id);
		if (!parsed) continue;
		if (parsed.type === "section") {
			result.topLevel.push({ type: "section", id: parsed.realId });
			result.sections[parsed.realId] ??= [];
		} else if (parsed.type === "workspace") {
			const sectionFlatId = membership[String(id)];
			const sectionRealId = sectionFlatId
				? parseId(sectionFlatId)?.realId
				: undefined;
			// Headers precede their members in a well-formed list; membership
			// pointing at a section absent from this list is stale — treat the
			// row as ungrouped so the commit self-heals it.
			if (sectionRealId && result.sections[sectionRealId]) {
				result.sections[sectionRealId].push(parsed.realId);
			} else {
				result.topLevel.push({ type: "workspace", id: parsed.realId });
			}
		}
	}
	return result;
}

// ── Context ──────────────────────────────────────────────────────────

export type SidebarDndActiveItem =
	| { type: "project"; project: DashboardSidebarProject }
	| { type: "workspace"; workspace: DashboardSidebarWorkspace }
	| { type: "section"; section: DashboardSidebarSection };

/**
 * Shared drag state for the sidebar. Deliberately excludes anything that
 * changes on every pointer move (over id, predicted drop color): every row in
 * the sidebar consumes this context, so per-move churn here re-renders the
 * whole sidebar and makes dragging visibly stall. Drop zones read
 * `useDroppable().isOver` locally; the predicted accent renders on the
 * DragOverlay ghost instead of the in-list row.
 */
export interface DashboardSidebarDndValue {
	pinnedItems: UniqueIdentifier[];
	sessionItems: UniqueIdentifier[];
	projectItems: Record<string, UniqueIdentifier[]>;
	getProjectSortableItems: (projectId: string) => UniqueIdentifier[];
	activeId: UniqueIdentifier | null;
	activeType: "project" | "workspace" | "section" | null;
	/** Container currently holding the active workspace/section, if any. */
	activeContainer: string | null;
	/**
	 * The dragged workspace's home container ("sessions" or its project id) —
	 * the only non-pinned container it may be dropped into.
	 */
	activeWorkspaceHome: string | null;
	workspacesById: Map<string, DashboardSidebarWorkspace>;
	sectionsById: Map<string, DashboardSidebarSection>;
	projectsById: Map<string, DashboardSidebarProject>;
	groupInfo: Map<string, { sectionId: string; color: string | null }>;
	collapsedSectionIds: Set<string>;
	/**
	 * Height (px) of the rows hidden by an active section drag. Rendered as a
	 * spacer at the end of the sidebar scroller so the pickup doesn't shrink
	 * scrollHeight: a shrink clamps scrollTop when scrolled near the bottom,
	 * and dnd-kit folds that scroll delta into the DragOverlay transform —
	 * the ghost then rides the collapsed height away from the cursor.
	 */
	sectionDragSpacerPx: number;
}

const DashboardSidebarDndContext =
	createContext<DashboardSidebarDndValue | null>(null);

export const SidebarDndContextProvider = DashboardSidebarDndContext.Provider;

export function useDashboardSidebarDnd(): DashboardSidebarDndValue {
	const value = useContext(DashboardSidebarDndContext);
	if (!value) {
		throw new Error(
			"useDashboardSidebarDnd must be used within DashboardSidebarDndProvider",
		);
	}
	return value;
}

// ── Hook ─────────────────────────────────────────────────────────────

interface UseSidebarDndOptions {
	/** Projects in their current display order. */
	projects: DashboardSidebarProject[];
	pinnedWorkspaces: DashboardSidebarPinnedWorkspace[];
	sessionWorkspaces: DashboardSidebarWorkspace[];
	onReorderProjects: (projectIds: string[]) => void;
}

export function useSidebarDnd({
	projects,
	pinnedWorkspaces,
	sessionWorkspaces,
	onReorderProjects,
}: UseSidebarDndOptions) {
	const {
		reorderPinnedWorkspaces,
		reorderProjectChildren,
		moveWorkspaceToSectionAtIndex,
		setWorkspacePinned,
	} = useDashboardSidebarState();

	const sensors = useSensors(
		// 5px absorbs the 1-3px of jitter a real click carries without turning
		// it into a pickup; anything smaller starts reordering rows on sloppy
		// clicks. The trailing click after an activated drag is already
		// swallowed by dnd-kit (capture-phase document click listener installed
		// at activation, detached one event loop after the drag ends).
		useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const [items, setItems] = useState<SidebarDndItems>(() => ({
		pinned: pinnedWorkspaces.map((ws) => wsId(ws.id)),
		sessions: sessionWorkspaces.map((ws) => wsId(ws.id)),
		byProject: Object.fromEntries(
			projects.map((project) => [project.id, buildFlatItems(project.children)]),
		),
		membership: buildMembership(projects),
	}));
	// Drag handlers read AND write these refs synchronously: pointer events can
	// batch faster than React re-renders (especially under main-thread stalls),
	// so deriving containers from the last *rendered* state mid-drag would work
	// on stale data — that's how items can get duplicated or misplaced.
	// commitDragItems is the ONLY writer (every setItems goes through it);
	// never re-assign these refs during render — an interrupted/discarded
	// concurrent render pass could roll them back to a pre-transfer snapshot.
	const itemsRef = useRef(items);
	const containerByIdRef = useRef(buildContainerMap(items));
	const commitDragItems = useCallback((next: SidebarDndItems) => {
		itemsRef.current = next;
		containerByIdRef.current = buildContainerMap(next);
		setItems(next);
	}, []);
	const containerById = useMemo(() => buildContainerMap(items), [items]);

	const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
	// Synchronous mirror of activeId: guards the data-sync effect against
	// clobbering drag state before the activeId state commit lands.
	const activeIdRef = useRef<UniqueIdentifier | null>(null);
	const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
	const clonedRef = useRef<SidebarDndItems | null>(null);

	const projectIds = useMemo(
		() => new Set(projects.map((project) => project.id)),
		[projects],
	);

	const typeOf = useCallback(
		(id: UniqueIdentifier): "project" | "workspace" | "section" | null => {
			const s = String(id);
			if (s.startsWith(WS)) return "workspace";
			if (s.startsWith(SEC)) return "section";
			if (projectIds.has(s)) return "project";
			return null;
		},
		[projectIds],
	);

	const activeType = activeId ? typeOf(activeId) : null;

	// Sync from external data when items or their order/membership changes
	const prevFingerprintRef = useRef("");
	useEffect(() => {
		if (activeId || activeIdRef.current) return; // Don't reset during active drag
		const fingerprint = [
			pinnedWorkspaces.map((ws) => ws.id).join("|"),
			sessionWorkspaces.map((ws) => ws.id).join("|"),
			projects
				.map(
					(project) =>
						`${project.id}:${project.children
							.map((c) =>
								c.type === "workspace"
									? c.workspace.id
									: `s:${c.section.id}:${c.section.workspaces.map((w) => w.id).join("|")}`,
							)
							.join(",")}`,
				)
				.join(";"),
		].join("\n");
		if (fingerprint !== prevFingerprintRef.current) {
			prevFingerprintRef.current = fingerprint;
			commitDragItems({
				pinned: pinnedWorkspaces.map((ws) => wsId(ws.id)),
				sessions: sessionWorkspaces.map((ws) => wsId(ws.id)),
				byProject: Object.fromEntries(
					projects.map((project) => [
						project.id,
						buildFlatItems(project.children),
					]),
				),
				membership: buildMembership(projects),
			});
		}
	}, [
		projects,
		pinnedWorkspaces,
		sessionWorkspaces,
		activeId,
		commitDragItems,
	]);

	// ── Lookups ──────────────────────────────────────────────────────

	const workspacesById = useMemo(() => {
		const map = new Map<string, DashboardSidebarWorkspace>();
		for (const ws of pinnedWorkspaces) map.set(ws.id, ws);
		for (const ws of sessionWorkspaces) map.set(ws.id, ws);
		for (const project of projects) {
			for (const child of project.children) {
				if (child.type === "workspace") {
					map.set(child.workspace.id, child.workspace);
				} else {
					for (const ws of child.section.workspaces) {
						map.set(ws.id, ws);
					}
				}
			}
		}
		return map;
	}, [projects, pinnedWorkspaces, sessionWorkspaces]);

	const sectionsById = useMemo(() => {
		const map = new Map<string, DashboardSidebarSection>();
		for (const project of projects) {
			for (const child of project.children) {
				if (child.type === "section") {
					map.set(child.section.id, child.section);
				}
			}
		}
		return map;
	}, [projects]);

	const projectsById = useMemo(
		() => new Map(projects.map((project) => [project.id, project])),
		[projects],
	);

	const collapsedSectionIds = useMemo(() => {
		const set = new Set<string>();
		for (const section of sectionsById.values()) {
			if (section.isCollapsed) set.add(section.id);
		}
		return set;
	}, [sectionsById]);

	// Which section does each workspace belong to? (for visual grouping)
	const groupInfo = useMemo(() => {
		const map = new Map<string, { sectionId: string; color: string | null }>();
		for (const [wsFlatId, secFlatId] of Object.entries(items.membership)) {
			const wsParsed = parseId(wsFlatId);
			const secParsed = parseId(secFlatId);
			if (!wsParsed || !secParsed) continue;
			const sec = sectionsById.get(secParsed.realId);
			if (!sec) continue;
			map.set(wsParsed.realId, { sectionId: sec.id, color: sec.color });
		}
		return map;
	}, [items.membership, sectionsById]);

	const activeContainer = activeId
		? (containerById.get(activeId) ?? null)
		: null;

	// Matches the sidebar workspace row height (h-8).
	const SIDEBAR_ROW_PX = 32;
	const sectionDragSpacerPx = useMemo(() => {
		if (activeType !== "section" || !activeContainer) return 0;
		const list = items.byProject[activeContainer] ?? [];
		let hiddenRows = 0;
		for (const id of list) {
			const sectionFlatId = items.membership[String(id)];
			if (!sectionFlatId) continue;
			const parsed = parseId(sectionFlatId);
			const section = parsed ? sectionsById.get(parsed.realId) : undefined;
			// Members of collapsed sections are already zero-height before the drag.
			if (section && !section.isCollapsed) hiddenRows++;
		}
		return hiddenRows * SIDEBAR_ROW_PX;
	}, [activeType, activeContainer, items, sectionsById]);

	const activeWorkspaceHome = useMemo(() => {
		if (!activeId || activeType !== "workspace") return null;
		const parsed = parseId(activeId);
		if (!parsed) return null;
		const ws = workspacesById.get(parsed.realId);
		if (!ws) return null;
		return ws.projectId ?? SESSIONS_CONTAINER;
	}, [activeId, activeType, workspacesById]);

	const activeItem = useMemo<SidebarDndActiveItem | null>(() => {
		if (!activeId) return null;
		if (activeType === "project") {
			const project = projectsById.get(String(activeId));
			return project ? { type: "project", project } : null;
		}
		const parsed = parseId(activeId);
		if (!parsed) return null;
		if (parsed.type === "workspace") {
			const ws = workspacesById.get(parsed.realId);
			return ws ? { type: "workspace", workspace: ws } : null;
		}
		const sec = sectionsById.get(parsed.realId);
		return sec ? { type: "section", section: sec } : null;
	}, [activeId, activeType, projectsById, workspacesById, sectionsById]);

	// Color the active workspace's ghost should show based on where it would
	// land. Only meaningful while it hovers inside a project list. Mirrors the
	// drop handler: simulate the arrayMove, then read the landing neighbors.
	const predictedColor = useMemo(() => {
		if (!activeId || !overId || activeType !== "workspace") return null;
		if (
			!activeContainer ||
			activeContainer === PINNED_CONTAINER ||
			activeContainer === SESSIONS_CONTAINER
		) {
			return null;
		}
		const list = items.byProject[activeContainer] ?? [];
		const oldIndex = list.indexOf(activeId);
		const overIndex = list.indexOf(overId);
		if (oldIndex === -1 || overIndex === -1) return null;
		const moved =
			oldIndex === overIndex ? list : arrayMove(list, oldIndex, overIndex);
		const sectionFlatId = membershipFromNeighbors(
			moved,
			items.membership,
			activeId,
		);
		if (!sectionFlatId) return null; // ungrouped landing spot
		const parsed = parseId(sectionFlatId);
		const sec = parsed ? sectionsById.get(parsed.realId) : undefined;
		return sec?.color ?? null;
	}, [activeId, overId, activeType, activeContainer, items, sectionsById]);

	// When dragging a section, its project's SortableContext collapses to the
	// top-level units — section headers and ungrouped rows — so the section can
	// sort against both (grouped rows hide and move with their header). Other
	// projects (and idle projects) keep everything.
	const getProjectSortableItems = useCallback(
		(projectId: string) => {
			const list = items.byProject[projectId] ?? [];
			if (activeType === "section" && activeContainer === projectId) {
				return list.filter((id) => isSec(id) || !items.membership[String(id)]);
			}
			return list;
		},
		[items.byProject, items.membership, activeType, activeContainer],
	);

	// The sidebar data builder always sorts local main workspaces first,
	// so any drop that lands an item above one would silently revert on
	// the next rebuild (e.g. when the sidebar collapses and remounts).
	// Normalize drop results to match what actually persists.
	const normalizeMainFirst = useCallback(
		(list: UniqueIdentifier[]) => {
			const mains: UniqueIdentifier[] = [];
			const rest: UniqueIdentifier[] = [];
			for (const id of list) {
				const parsed = parseId(id);
				const ws =
					parsed?.type === "workspace"
						? workspacesById.get(parsed.realId)
						: null;
				if (ws?.type === "main" && ws.hostType === "local-device") {
					mains.push(id);
				} else {
					rest.push(id);
				}
			}
			return mains.length > 0 ? [...mains, ...rest] : list;
		},
		[workspacesById],
	);

	// ── Collision detection ──────────────────────────────────────────
	//
	// One DndContext holds project headers, section headers, and every
	// workspace row, so raw closestCenter would happily match a project header
	// while dragging a workspace. Restrict targets by drag kind: projects sort
	// among projects, sections within their project, and a workspace may only
	// target the Pinned section or its home container.
	//
	// Workspace drags additionally must NOT use bare closestCenter: their two
	// allowed containers (Pinned at the top, home lower down) can sit far
	// apart, and in the gap between them "closest" flips on sub-pixel movement
	// — and on the layout shift a container transfer itself causes, which
	// re-measures and flips it again with the pointer stationary. That
	// feedback loop transfers the row back and forth until React aborts with
	// "Maximum update depth exceeded". Use dnd-kit's multi-container strategy
	// instead: pointer containment first, then rect intersection, then the
	// cached last hit — plus a one-frame freeze right after each transfer so
	// the post-transfer re-measure can't immediately re-trigger.

	const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
	const recentlyMovedToNewContainerRef = useRef(false);
	// Freeze collisions for one frame after a transfer, then re-arm. Scheduled
	// at the set-site (not a deps-only effect): rAF fires after the transfer's
	// render+paint, and there is no dependency array for lint autofixes to
	// strip — an empty-deps version of this freezes the rest of the drag after
	// the first transfer.
	const freezeCollisionsForOneFrame = useCallback(() => {
		recentlyMovedToNewContainerRef.current = true;
		requestAnimationFrame(() => {
			recentlyMovedToNewContainerRef.current = false;
		});
	}, []);

	const collisionDetection = useCallback<CollisionDetection>(
		(args) => {
			const type = typeOf(args.active.id);

			if (type === "project") {
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter((container) =>
						projectIds.has(String(container.id)),
					),
				});
			}

			if (type === "section") {
				// Stock closestCenter is safe here because SectionDragSpacer keeps
				// scrollHeight constant at pickup (no scrollTop clamp to desync
				// dnd-kit's scroll compensation) and the drag-collapse is instant
				// (the member-unregister re-measure sees the final layout).
				const container = containerByIdRef.current.get(args.active.id);
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(candidate) =>
							container != null &&
							containerByIdRef.current.get(candidate.id) === container,
					),
				});
			}

			if (type === "workspace") {
				if (recentlyMovedToNewContainerRef.current) {
					lastOverIdRef.current = args.active.id;
					return [{ id: args.active.id }];
				}

				const parsed = parseId(args.active.id);
				const ws = parsed ? workspacesById.get(parsed.realId) : null;
				const home = ws ? (ws.projectId ?? SESSIONS_CONTAINER) : null;
				const droppableContainers = args.droppableContainers.filter(
					(candidate) => {
						const container =
							parseDropZoneId(candidate.id) ??
							containerByIdRef.current.get(candidate.id);
						return container === PINNED_CONTAINER || container === home;
					},
				);

				const pointerCollisions = pointerWithin({
					...args,
					droppableContainers,
				});
				const collisions =
					pointerCollisions.length > 0
						? pointerCollisions
						: rectIntersection({ ...args, droppableContainers });
				const overId = getFirstCollision(collisions, "id");
				if (overId != null) {
					lastOverIdRef.current = overId;
					return collisions;
				}
				// Pointer is over disallowed territory (another project's rows, the
				// gap between containers): hold the last real hit instead of
				// snapping to whichever allowed target happens to be "closest".
				return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : [];
			}

			return closestCenter(args);
		},
		[typeOf, projectIds, workspacesById],
	);

	// ── Persistence ──────────────────────────────────────────────────

	const commitProjectToDb = useCallback(
		(
			projectId: string,
			list: UniqueIdentifier[],
			membership: Record<string, string>,
		) => {
			const parsed = parseFlatItems(list, membership);

			// Top-level order (ungrouped workspaces + sections interleaved)
			reorderProjectChildren(projectId, parsed.topLevel);

			// Each section's workspace order
			for (const [sectionId, wsIds] of Object.entries(parsed.sections)) {
				for (let i = 0; i < wsIds.length; i++) {
					moveWorkspaceToSectionAtIndex(wsIds[i], projectId, sectionId, i);
				}
			}
		},
		[reorderProjectChildren, moveWorkspaceToSectionAtIndex],
	);

	const persistWorkspaceDrop = useCallback(
		(
			workspaceId: string,
			container: string,
			containerList: UniqueIdentifier[],
			membership: Record<string, string>,
		) => {
			const ws = workspacesById.get(workspaceId);
			if (container === PINNED_CONTAINER) {
				reorderPinnedWorkspaces(
					containerList.flatMap((id) => {
						const parsed = parseId(id);
						if (parsed?.type !== "workspace") return [];
						return [
							{
								workspaceId: parsed.realId,
								projectId: workspacesById.get(parsed.realId)?.projectId ?? null,
							},
						];
					}),
					// One drag pins at most one new workspace; the mutation drops
					// any other not-yet-pinned id as a corrupted-state safety net.
					{ allowNewWorkspaceId: workspaceId },
				);
				return;
			}

			// Dropped outside the Pinned section: clear the pin so the row lands
			// where the commit below places it instead of snapping back.
			if (ws?.isPinned) {
				setWorkspacePinned(workspaceId, ws.projectId, false);
			}

			if (container === SESSIONS_CONTAINER) {
				reorderProjectChildren(
					null,
					containerList.flatMap((id) => {
						const parsed = parseId(id);
						if (parsed?.type !== "workspace") return [];
						return [{ type: "workspace" as const, id: parsed.realId }];
					}),
				);
				return;
			}

			commitProjectToDb(container, containerList, membership);
		},
		[
			workspacesById,
			reorderPinnedWorkspaces,
			reorderProjectChildren,
			setWorkspacePinned,
			commitProjectToDb,
		],
	);

	// ── Handlers ─────────────────────────────────────────────────────

	const onDragStart = useCallback(({ active }: DragStartEvent) => {
		activeIdRef.current = active.id;
		lastOverIdRef.current = null;
		recentlyMovedToNewContainerRef.current = false;
		setActiveId(active.id);
		clonedRef.current = itemsRef.current;
	}, []);

	const onDragOver = useCallback(
		({ active, over }: DragOverEvent) => {
			setOverId(over?.id ?? null);
			if (!over || typeOf(active.id) !== "workspace") return;

			// Cross-container hover: move the row into the hovered container so
			// its list makes room and the drop lands where the preview shows.
			// Everything is computed from — and written back to — itemsRef
			// synchronously; see the ref's declaration comment.
			const current = itemsRef.current;
			const sourceContainer = containerByIdRef.current.get(active.id);
			const targetContainer =
				parseDropZoneId(over.id) ?? containerByIdRef.current.get(over.id);
			if (
				!sourceContainer ||
				!targetContainer ||
				sourceContainer === targetContainer
			) {
				return;
			}

			const source = getContainerList(current, sourceContainer).filter(
				(id) => id !== active.id,
			);
			const target = [...getContainerList(current, targetContainer)];
			if (target.includes(active.id)) return;
			const overIndex = target.indexOf(over.id);
			let newIndex: number;
			if (overIndex === -1) {
				newIndex = target.length;
			} else {
				const isBelowOverItem =
					active.rect.current.translated != null &&
					active.rect.current.translated.top > over.rect.top + over.rect.height;
				newIndex = overIndex + (isBelowOverItem ? 1 : 0);
			}
			target.splice(newIndex, 0, active.id);
			freezeCollisionsForOneFrame();
			const next = withContainerList(
				withContainerList(current, sourceContainer, source),
				targetContainer,
				target,
			);
			// Keep membership in step with the transfer so the row previews its
			// landing group's accent (or none) while still mid-drag.
			const membership = { ...next.membership };
			const sectionFlatId =
				targetContainer !== PINNED_CONTAINER &&
				targetContainer !== SESSIONS_CONTAINER
					? membershipFromNeighbors(target, membership, active.id)
					: null;
			if (sectionFlatId) {
				membership[String(active.id)] = sectionFlatId;
			} else {
				delete membership[String(active.id)];
			}
			commitDragItems({ ...next, membership });
		},
		[typeOf, commitDragItems, freezeCollisionsForOneFrame],
	);

	const onDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			const type = typeOf(active.id);
			const snapshot = clonedRef.current;
			clonedRef.current = null;
			activeIdRef.current = null;
			setActiveId(null);
			setOverId(null);

			const revert = () => {
				if (snapshot) commitDragItems(snapshot);
			};

			if (!over) {
				revert();
				return;
			}

			if (type === "project") {
				if (active.id !== over.id && projectIds.has(String(over.id))) {
					const order = projects.map((project) => project.id);
					const oldIndex = order.indexOf(String(active.id));
					const newIndex = order.indexOf(String(over.id));
					if (oldIndex !== -1 && newIndex !== -1) {
						onReorderProjects(arrayMove(order, oldIndex, newIndex));
					}
				}
				return;
			}

			const current = itemsRef.current;

			if (type === "section") {
				const container = containerByIdRef.current.get(active.id);
				if (!container || !projectIds.has(container) || active.id === over.id) {
					return;
				}
				const list = current.byProject[container] ?? [];

				// Section drag: the SortableContext held top-level units — section
				// headers and ungrouped rows. Collapse the flat list into those
				// units (a section unit carries its member rows), reorder the
				// dragged section among them, and flatten back out. Sections sort
				// against ungrouped rows exactly like any other item.
				interface TopLevelUnit {
					key: UniqueIdentifier;
					ids: UniqueIdentifier[];
				}
				const units: TopLevelUnit[] = [];
				const unitBySection = new Map<string, TopLevelUnit>();
				for (const id of list) {
					if (isSec(id)) {
						const unit: TopLevelUnit = { key: id, ids: [id] };
						units.push(unit);
						unitBySection.set(String(id), unit);
						continue;
					}
					const sectionFlatId = current.membership[String(id)];
					const owner = sectionFlatId
						? unitBySection.get(sectionFlatId)
						: undefined;
					if (owner) {
						owner.ids.push(id);
					} else {
						units.push({ key: id, ids: [id] });
					}
				}

				const oldIdx = units.findIndex((unit) => unit.key === active.id);
				const newIdx = units.findIndex((unit) => unit.key === over.id);
				if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

				const rebuilt = arrayMove(units, oldIdx, newIdx).flatMap(
					(unit) => unit.ids,
				);

				const newList = normalizeMainFirst(rebuilt);
				commitDragItems(withContainerList(current, container, newList));
				commitProjectToDb(container, newList, current.membership);
				return;
			}

			if (type === "workspace") {
				const parsed = parseId(active.id);
				const sourceContainer = containerByIdRef.current.get(active.id);
				const targetContainer =
					parseDropZoneId(over.id) ??
					containerByIdRef.current.get(over.id) ??
					sourceContainer;
				if (!parsed || !sourceContainer || !targetContainer) {
					revert();
					return;
				}

				let targetList: UniqueIdentifier[];
				let next = current;
				if (sourceContainer !== targetContainer) {
					// onDragOver normally transfers before the drop; cover the drop
					// that lands before the transfer fires.
					const source = getContainerList(current, sourceContainer).filter(
						(id) => id !== active.id,
					);
					targetList = [...getContainerList(current, targetContainer)];
					const overIndex = targetList.indexOf(over.id);
					targetList.splice(
						overIndex === -1 ? targetList.length : overIndex,
						0,
						active.id,
					);
					next = withContainerList(next, sourceContainer, source);
				} else {
					targetList = getContainerList(current, targetContainer);
					const oldIndex = targetList.indexOf(active.id);
					const overIndex = targetList.indexOf(over.id);
					if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) {
						targetList = arrayMove(targetList, oldIndex, overIndex);
					}
				}

				if (
					targetContainer !== PINNED_CONTAINER &&
					targetContainer !== SESSIONS_CONTAINER
				) {
					targetList = normalizeMainFirst(targetList);
				}

				// Skip the writes when the drop lands exactly where the drag
				// started (same container, same order) — dropping in place must
				// not rewrite pinnedAt/tabOrder rows.
				const startList = snapshot
					? getContainerList(snapshot, targetContainer)
					: null;
				const unchanged =
					startList != null &&
					startList.length === targetList.length &&
					startList.every((id, index) => id === targetList[index]);

				const membership = { ...next.membership };
				if (unchanged) {
					// In-place drop: restore the pre-drag membership (mid-drag
					// container transfers may have rewritten it) instead of
					// re-deriving it — an in-place drop must change nothing.
					const snapshotSection = snapshot?.membership[String(active.id)];
					if (snapshotSection) {
						membership[String(active.id)] = snapshotSection;
					} else {
						delete membership[String(active.id)];
					}
				} else {
					const sectionFlatId =
						targetContainer !== PINNED_CONTAINER &&
						targetContainer !== SESSIONS_CONTAINER
							? membershipFromNeighbors(targetList, membership, active.id)
							: null;
					if (sectionFlatId) {
						membership[String(active.id)] = sectionFlatId;
					} else {
						delete membership[String(active.id)];
					}
				}

				commitDragItems({
					...withContainerList(next, targetContainer, targetList),
					membership,
				});

				if (!unchanged) {
					persistWorkspaceDrop(
						parsed.realId,
						targetContainer,
						targetList,
						membership,
					);
				}
			}
		},
		[
			typeOf,
			projects,
			projectIds,
			onReorderProjects,
			normalizeMainFirst,
			commitProjectToDb,
			persistWorkspaceDrop,
			commitDragItems,
		],
	);

	const onDragCancel = useCallback(() => {
		// dnd-kit swallows the click that trails a drop (capture-phase document
		// listener, detached ~50ms after the drag ends), but an Escape-cancel
		// leaves the button held — the click fires on the later release and
		// would navigate the row under the cursor. Mirror dnd-kit's technique
		// for that one case: swallow the next click, disarming right after the
		// release so a subsequent real click works normally.
		const swallowClick = (event: Event) => {
			event.stopPropagation();
			disarm();
		};
		const onMouseUp = () => {
			// The trailing click (if any) fires before this timeout runs.
			setTimeout(disarm, 50);
		};
		const disarm = () => {
			document.removeEventListener("click", swallowClick, { capture: true });
			document.removeEventListener("mouseup", onMouseUp, { capture: true });
		};
		document.addEventListener("click", swallowClick, { capture: true });
		document.addEventListener("mouseup", onMouseUp, { capture: true });

		if (clonedRef.current) {
			commitDragItems(clonedRef.current);
		}
		activeIdRef.current = null;
		setActiveId(null);
		setOverId(null);
		clonedRef.current = null;
	}, [commitDragItems]);

	const contextValue = useMemo<DashboardSidebarDndValue>(
		() => ({
			pinnedItems: items.pinned,
			sessionItems: items.sessions,
			projectItems: items.byProject,
			getProjectSortableItems,
			activeId,
			activeType,
			activeContainer,
			activeWorkspaceHome,
			workspacesById,
			sectionsById,
			projectsById,
			groupInfo,
			collapsedSectionIds,
			sectionDragSpacerPx,
		}),
		[
			items,
			getProjectSortableItems,
			activeId,
			activeType,
			activeContainer,
			activeWorkspaceHome,
			workspacesById,
			sectionsById,
			projectsById,
			groupInfo,
			collapsedSectionIds,
			sectionDragSpacerPx,
		],
	);

	return {
		sensors,
		measuring,
		collisionDetection,
		activeItem,
		// Per-pointer-move value, consumed only by the provider's DragOverlay so
		// its churn never fans out through the context.
		predictedColor,
		contextValue,
		handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
	};
}
