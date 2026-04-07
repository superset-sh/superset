import {
	closestCenter,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	TouchSensor,
	type UniqueIdentifier,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import type {
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

// ── ID helpers ───────────────────────────────────────────────────────

const WS = "ws::";
const SEC = "sec::";

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

// ── Parse flat list to determine section membership ──────────────────

interface ParsedFlatItems {
	topLevel: Array<{ type: "workspace" | "section"; id: string }>;
	sections: Record<string, string[]>;
}

function parseFlatItems(items: UniqueIdentifier[]): ParsedFlatItems {
	const result: ParsedFlatItems = { topLevel: [], sections: {} };
	let currentSection: string | null = null;

	for (const id of items) {
		const parsed = parseId(id);
		if (!parsed) continue;
		if (parsed.type === "section") {
			currentSection = parsed.realId;
			result.topLevel.push({ type: "section", id: parsed.realId });
			result.sections[parsed.realId] = [];
		} else if (parsed.type === "workspace") {
			if (currentSection) {
				result.sections[currentSection].push(parsed.realId);
			} else {
				result.topLevel.push({ type: "workspace", id: parsed.realId });
			}
		}
	}
	return result;
}

// ── Hook ─────────────────────────────────────────────────────────────

interface UseSidebarDndOptions {
	projectId: string;
	projectChildren: DashboardSidebarProjectChild[];
}

export function useSidebarDnd({
	projectId,
	projectChildren,
}: UseSidebarDndOptions) {
	const { reorderProjectChildren, moveWorkspaceToSectionAtIndex } =
		useDashboardSidebarState();

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const [flatItems, setFlatItems] = useState<UniqueIdentifier[]>(() =>
		buildFlatItems(projectChildren),
	);
	const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
	const activeType: "workspace" | "section" | null = activeId
		? isSec(activeId)
			? "section"
			: "workspace"
		: null;
	const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
	const clonedRef = useRef<UniqueIdentifier[] | null>(null);

	// When dragging a section, SortableContext only has section IDs.
	// When dragging a workspace (or idle), SortableContext has everything.
	const sortableItems = useMemo(() => {
		if (activeType === "section") {
			return flatItems.filter((id) => isSec(id));
		}
		return flatItems;
	}, [flatItems, activeType]);

	// Sync from external data when items or their order/membership changes
	const prevFingerprintRef = useRef("");
	useEffect(() => {
		if (activeId) return; // Don't reset during active drag
		const fingerprint = projectChildren
			.map((c) =>
				c.type === "workspace"
					? c.workspace.id
					: `s:${c.section.id}:${c.section.workspaces.map((w) => w.id).join("|")}`,
			)
			.join(",");
		if (fingerprint !== prevFingerprintRef.current) {
			prevFingerprintRef.current = fingerprint;
			setFlatItems(buildFlatItems(projectChildren));
		}
	}, [projectChildren, activeId]);

	const collapsedSectionIds = useMemo(() => {
		const set = new Set<string>();
		for (const child of projectChildren) {
			if (child.type === "section" && child.section.isCollapsed) {
				set.add(child.section.id);
			}
		}
		return set;
	}, [projectChildren]);

	// ── Lookups ──────────────────────────────────────────────────────

	const workspacesById = useMemo(() => {
		const map = new Map<string, DashboardSidebarWorkspace>();
		for (const child of projectChildren) {
			if (child.type === "workspace") {
				map.set(child.workspace.id, child.workspace);
			} else {
				for (const ws of child.section.workspaces) {
					map.set(ws.id, ws);
				}
			}
		}
		return map;
	}, [projectChildren]);

	const sectionsById = useMemo(() => {
		const map = new Map<string, DashboardSidebarSection>();
		for (const child of projectChildren) {
			if (child.type === "section") {
				map.set(child.section.id, child.section);
			}
		}
		return map;
	}, [projectChildren]);

	// Which section does each workspace belong to? (for visual grouping)
	const groupInfo = useMemo(() => {
		const map = new Map<string, { sectionId: string; color: string | null }>();
		let currentSection: { id: string; color: string | null } | null = null;

		for (const id of flatItems) {
			const parsed = parseId(id);
			if (!parsed) continue;
			if (parsed.type === "section") {
				const sec = sectionsById.get(parsed.realId);
				currentSection = sec ? { id: sec.id, color: sec.color } : null;
			} else if (parsed.type === "workspace" && currentSection) {
				map.set(parsed.realId, {
					sectionId: currentSection.id,
					color: currentSection.color,
				});
			}
		}
		return map;
	}, [flatItems, sectionsById]);

	const activeItem = useMemo(() => {
		if (!activeId) return null;
		const parsed = parseId(activeId);
		if (!parsed) return null;
		if (parsed.type === "workspace") {
			const ws = workspacesById.get(parsed.realId);
			return ws ? { type: "workspace" as const, workspace: ws } : null;
		}
		const sec = sectionsById.get(parsed.realId);
		return sec ? { type: "section" as const, section: sec } : null;
	}, [activeId, workspacesById, sectionsById]);

	// Color the active workspace's ghost should show based on where it would land
	const predictedColor = useMemo(() => {
		if (!activeId || !overId || activeType !== "workspace") return null;
		const overIndex = flatItems.indexOf(overId);
		if (overIndex === -1) return null;
		// If over is a section header, the workspace lands ABOVE it,
		// so look for the section above the over position (skip the over itself)
		const startFrom = isSec(overId) ? overIndex - 1 : overIndex;
		for (let i = startFrom; i >= 0; i--) {
			const p = parseId(flatItems[i]);
			if (p?.type === "section") {
				const sec = sectionsById.get(p.realId);
				return sec?.color ?? null;
			}
		}
		return null; // ungrouped — no section above
	}, [activeId, overId, activeType, flatItems, sectionsById]);

	// ── Persistence ──────────────────────────────────────────────────

	const commitToDb = useCallback(
		(items: UniqueIdentifier[]) => {
			const parsed = parseFlatItems(items);

			// Top-level order (ungrouped workspaces + sections interleaved)
			reorderProjectChildren(projectId, parsed.topLevel);

			// Each section's workspace order
			for (const [sectionId, wsIds] of Object.entries(parsed.sections)) {
				for (let i = 0; i < wsIds.length; i++) {
					moveWorkspaceToSectionAtIndex(wsIds[i], projectId, sectionId, i);
				}
			}
		},
		[projectId, reorderProjectChildren, moveWorkspaceToSectionAtIndex],
	);

	// ── Handlers ─────────────────────────────────────────────────────

	const onDragStart = useCallback(
		({ active }: DragStartEvent) => {
			setActiveId(active.id);
			clonedRef.current = [...flatItems];
		},
		[flatItems],
	);

	const onDragOver = useCallback(({ over }: DragOverEvent) => {
		setOverId(over?.id ?? null);
	}, []);

	const onDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			setActiveId(null);
			setOverId(null);

			if (!over || active.id === over.id) return;

			if (isSec(active.id)) {
				// Section drag: only section IDs were in the SortableContext.
				// Reorder sections, then rebuild the full flat list with
				// workspaces in their original positions under each section.
				const sectionIds = flatItems.filter((id) => isSec(id));
				const oldIdx = sectionIds.indexOf(active.id);
				const newIdx = sectionIds.indexOf(over.id);
				if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

				const reorderedSections = arrayMove(sectionIds, oldIdx, newIdx);

				// Rebuild flat list: ungrouped workspaces first, then
				// each section with its workspaces in new section order
				const ungrouped: UniqueIdentifier[] = [];
				const sectionGroups = new Map<string, UniqueIdentifier[]>();

				let currentSec: string | null = null;
				for (const id of flatItems) {
					if (isSec(id)) {
						currentSec = String(id);
						sectionGroups.set(currentSec, []);
					} else if (currentSec) {
						sectionGroups.get(currentSec)?.push(id);
					} else {
						ungrouped.push(id);
					}
				}

				const newItems: UniqueIdentifier[] = [...ungrouped];
				for (const secSortId of reorderedSections) {
					newItems.push(secSortId);
					const wsInSec = sectionGroups.get(String(secSortId)) ?? [];
					newItems.push(...wsInSec);
				}

				setFlatItems(newItems);
				commitToDb(newItems);
			} else {
				// Workspace drag: simple arrayMove in the full flat list
				const oldIndex = flatItems.indexOf(active.id);
				const overIndex = flatItems.indexOf(over.id);
				if (oldIndex === -1 || overIndex === -1 || oldIndex === overIndex)
					return;

				const newItems = arrayMove(flatItems, oldIndex, overIndex);
				setFlatItems(newItems);
				commitToDb(newItems);
			}
		},
		[flatItems, commitToDb],
	);

	const onDragCancel = useCallback(() => {
		if (clonedRef.current) {
			setFlatItems(clonedRef.current);
		}
		setActiveId(null);
		setOverId(null);
		clonedRef.current = null;
	}, []);

	return {
		sensors,
		measuring,
		collisionDetection: closestCenter,
		flatItems,
		sortableItems,
		activeId,
		activeType,
		activeItem,
		predictedColor,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
		handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
	};
}
