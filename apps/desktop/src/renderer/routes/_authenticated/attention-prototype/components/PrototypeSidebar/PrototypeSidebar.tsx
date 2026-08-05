import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	pointerWithin,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
} from "@superset/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LayoutGroup, motion } from "framer-motion";
import {
	Fragment,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { IconType } from "react-icons";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import {
	LuALargeSmall,
	LuArrowDownWideNarrow,
	LuArrowUpNarrowWide,
	LuBot,
	LuCalendarPlus,
	LuCircle,
	LuCircleAlert,
	LuCircleCheck,
	LuCircleDashed,
	LuFolderGit2,
	LuFoldVertical,
	LuGitMerge,
	LuGitPullRequestArrow,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
	LuGripVertical,
	LuHistory,
	LuList,
	LuListChecks,
	LuLoaderCircle,
	LuMessageCircleQuestion,
	LuMessageCircleWarning,
	LuUnfoldVertical,
} from "react-icons/lu";
import { useHotkey } from "renderer/hotkeys";
import { DashboardSidebarWorkspaceIcon } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceIcon";
import { StatusIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import type { PaneStatus } from "shared/tabs-types";
import { useLayoutAwareHotkey } from "../../hooks/useLayoutAwareHotkey";
import { buildPrototypeView } from "../../model/buildPrototypeView";
import type { GroupBy, OrderBy, PrBucket } from "../../model/types";
import { usePrototypeStore } from "../../store/usePrototypeStore";
import { PrototypeProjectsHeader } from "../PrototypeProjectsHeader/PrototypeProjectsHeader";
import { PrototypeSidebarFooter } from "../PrototypeSidebarFooter/PrototypeSidebarFooter";
import { PrototypeSidebarHeader } from "../PrototypeSidebarHeader/PrototypeSidebarHeader";
import { PrototypeSidebarToggle } from "../PrototypeSidebarToggle/PrototypeSidebarToggle";
import { PrototypeWorkspaceRow } from "../PrototypeWorkspaceRow/PrototypeWorkspaceRow";
import { SortablePrototypeRow } from "../SortablePrototypeRow/SortablePrototypeRow";
import {
	HeaderFlashOverlay,
	type HeaderFlashProfile,
} from "./components/HeaderFlashOverlay/HeaderFlashOverlay";
import {
	GROUP_DROP_ID_PREFIX,
	PrototypeGroupDroppable,
} from "./components/PrototypeGroupDroppable/PrototypeGroupDroppable";
import {
	PrototypeTravelRow,
	TRAVEL_DURATION_S,
	TRAVEL_EASE_CSS,
} from "./components/PrototypeTravelRow/PrototypeTravelRow";

interface ViewOption {
	value: string;
	label: string;
	icon: IconType;
}

/** The "off" option leads (separator after), the rest alphabetical. */
const GROUP_BY_OPTIONS: ViewOption[] = [
	{ value: "none", label: "No groups", icon: LuList },
	{ value: "agent", label: "Agent activity", icon: LuBot },
	{ value: "linear", label: "Linear status", icon: LuCircleDashed },
	{ value: "pr", label: "Pull request", icon: LuGitPullRequestArrow },
	{ value: "repository", label: "Repository", icon: LuFolderGit2 },
];

/** Manual leads (separator after), the rest alphabetical. */
const ORDER_BY_OPTIONS: ViewOption[] = [
	{ value: "manual", label: "Manual", icon: LuGripVertical },
	{ value: "attention", label: "Agent activity", icon: LuBot },
	{ value: "created", label: "Created", icon: LuCalendarPlus },
	{ value: "title", label: "Name", icon: LuALargeSmall },
	{ value: "recent", label: "Recent", icon: LuHistory },
];

/**
 * Leading icon for agent-status group headers, playing the same role as a repo
 * thumbnail or Linear StatusIcon. Proper icons (not dots) keep the dot
 * vocabulary reserved for the pulsing corner StatusIndicator notifications;
 * colors mirror StatusIndicator's so headers and rows speak the same language.
 */
const AGENT_GROUP_ICON: Record<
	PaneStatus,
	{ icon: IconType; className: string }
> = {
	permission: { icon: LuMessageCircleQuestion, className: "text-red-500" },
	failed: { icon: LuCircleAlert, className: "text-red-500" },
	working: { icon: LuLoaderCircle, className: "text-amber-500" },
	review: { icon: LuCircleCheck, className: "text-green-500" },
	idle: { icon: LuCircle, className: "text-muted-foreground/50" },
};

/**
 * Leading icon per pull-request lifecycle bucket. Terminal-state buckets reuse
 * the real PR icon vocabulary (DashboardSidebarWorkspaceIcon's state map);
 * open-PR buckets get icons for their actionable signal.
 */
const PR_GROUP_ICON: Record<PrBucket, { icon: IconType; className: string }> = {
	"checks-failing": { icon: LuCircleAlert, className: "text-red-500" },
	"changes-requested": {
		icon: LuMessageCircleWarning,
		className: "text-orange-500",
	},
	"awaiting-review": {
		icon: LuGitPullRequestArrow,
		className: "text-emerald-500",
	},
	approved: { icon: LuCircleCheck, className: "text-green-500" },
	queued: { icon: LuListChecks, className: "text-amber-500" },
	draft: { icon: LuGitPullRequestDraft, className: "text-muted-foreground" },
	merged: { icon: LuGitMerge, className: "text-purple-500" },
	closed: { icon: LuGitPullRequestClosed, className: "text-destructive" },
	"no-pr": { icon: LuCircleDashed, className: "text-muted-foreground/50" },
};

/**
 * Delay before a collapsed DESTINATION header flashes when a visible card
 * travels into it. Early enough that the header is already fully lit while
 * the card (fading from ~55% of its 0.45s journey) melts into it — the glow
 * must be there to "receive" the card, not pop on after it's gone.
 */
const DEST_FLASH_DELAY_MS = 150;
/** Longer when the origin flashed first — sequences the journey. */
const DEST_FLASH_DELAY_AFTER_ORIGIN_MS = 500;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function PrototypeSidebar() {
	const groupBy = usePrototypeStore((s) => s.groupBy);
	const orderBy = usePrototypeStore((s) => s.orderBy);
	const direction = usePrototypeStore((s) => s.direction);
	const setGroupBy = usePrototypeStore((s) => s.setGroupBy);
	const setOrderBy = usePrototypeStore((s) => s.setOrderBy);
	const setDirection = usePrototypeStore((s) => s.setDirection);
	const manualOrder = usePrototypeStore((s) => s.manualOrder);
	const commitManualOrder = usePrototypeStore((s) => s.commitManualOrder);
	const setLinearStatus = usePrototypeStore((s) => s.setLinearStatus);
	const collapsedGroups = usePrototypeStore((s) => s.collapsedGroups);
	const projectsCollapsed = usePrototypeStore((s) => s.projectsCollapsed);
	const viewControlsCollapsed = usePrototypeStore(
		(s) => s.viewControlsCollapsed,
	);
	const revealViewControls = usePrototypeStore((s) => s.revealViewControls);
	const toggleViewControls = usePrototypeStore((s) => s.toggleViewControls);
	const toggleSidebarCollapsed = usePrototypeStore(
		(s) => s.toggleSidebarCollapsed,
	);
	const toggleGroupCollapsed = usePrototypeStore((s) => s.toggleGroupCollapsed);
	const setGroupsCollapsed = usePrototypeStore((s) => s.setGroupsCollapsed);
	const revealWorkspace = usePrototypeStore((s) => s.revealWorkspace);
	const sidebarCollapsed = usePrototypeStore(
		(s) => s.sidebarWidth === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	);
	// While the panel is being drag-resized, framer `layout` must be off: every
	// width frame would otherwise be treated as a layout change and FLIP-tweened
	// (visible text stretch/squash). The real sidebar reflows natively because
	// its rows carry no layout animation at all.
	const sidebarResizing = usePrototypeStore((s) => s.sidebarResizing);
	const workspaces = usePrototypeStore((s) => s.workspaces);
	const now = usePrototypeStore((s) => s.now);
	const activeWorkspaceId = usePrototypeStore((s) => s.activeWorkspaceId);
	const setActiveWorkspace = usePrototypeStore((s) => s.setActiveWorkspace);
	const lastChangedId = usePrototypeStore((s) => s.lastChangedId);
	const changeSeq = usePrototypeStore((s) => s.changeSeq);

	const groups = useMemo(
		() =>
			buildPrototypeView(workspaces, {
				groupBy,
				orderBy,
				direction,
				manualOrder,
			}),
		[workspaces, groupBy, orderBy, direction, manualOrder],
	);

	const isGroupCollapsed = (key: string) =>
		Boolean(collapsedGroups[`${groupBy}:${key}`]);

	// ── Travel bookkeeping ─────────────────────────────────────────────────────
	// Which group each workspace belonged to on the PREVIOUS commit, last-known
	// viewport positions of headers/rows, and the flash queue for collapsed
	// group headers. Together these let a status change animate its "journey":
	// origin header flash → card travel → destination header flash.
	const groupKeyByWorkspace = useMemo(() => {
		const map = new Map<string, string>();
		for (const group of groups) {
			for (const workspace of group.workspaces) {
				map.set(workspace.id, group.key);
			}
		}
		return map;
	}, [groups]);

	const prevGroupKeyRef = useRef<Map<string, string>>(new Map());
	const consumedSeqRef = useRef(0);
	const headerEls = useRef<Map<string, HTMLElement>>(new Map());
	const rowEls = useRef<Map<string, HTMLElement>>(new Map());
	// Positions (and row heights) from the previous commit — read during render
	// (before this commit's measurement effect overwrites them) to aim travel
	// animations.
	const rectsRef = useRef<Map<string, { top: number; height: number }>>(
		new Map(),
	);
	const [headerFlashes, setHeaderFlashes] = useState<
		Record<
			string,
			{ seq: number; delayMs: number; profile: HeaderFlashProfile }
		>
	>({});

	// Fresh cross-group move by the last-simulated workspace. Render-scoped:
	// the effect below marks the seq consumed so later renders (collapse
	// toggles, drags) don't re-trigger travel animations.
	const transition = (() => {
		if (!lastChangedId || changeSeq === consumedSeqRef.current) return null;
		const from = prevGroupKeyRef.current.get(lastChangedId);
		const to = groupKeyByWorkspace.get(lastChangedId);
		if (!from || !to || from === to) return null;
		return { id: lastChangedId, from, to };
	})();

	useEffect(() => {
		if (transition) {
			const fromCollapsed = isGroupCollapsed(transition.from);
			const toCollapsed = isGroupCollapsed(transition.to);
			const flashes: Record<
				string,
				{ seq: number; delayMs: number; profile: HeaderFlashProfile }
			> = {};
			// Only collapsed groups flash — in expanded groups the card itself is
			// visible and carries its own highlight. Origin first, destination
			// after the travel, so the journey reads start → end. When the card
			// visibly travels OUT of the origin (destination expanded), the origin
			// flash is brief — done by the time the card lands — so the eye hands
			// off to the moving card instead of watching two long glows.
			if (fromCollapsed) {
				flashes[transition.from] = {
					seq: changeSeq,
					delayMs: 0,
					profile: toCollapsed ? "hold" : "brief",
				};
			}
			if (toCollapsed) {
				flashes[transition.to] = {
					seq: changeSeq,
					delayMs: fromCollapsed
						? DEST_FLASH_DELAY_AFTER_ORIGIN_MS
						: DEST_FLASH_DELAY_MS,
					profile: "hold",
				};
			}
			if (Object.keys(flashes).length > 0) {
				setHeaderFlashes((prev) => ({ ...prev, ...flashes }));
			}
		}
		consumedSeqRef.current = changeSeq;
	});

	useEffect(() => {
		prevGroupKeyRef.current = groupKeyByWorkspace;
	}, [groupKeyByWorkspace]);

	// Travel exit glide. By the time the exit starts, React has already moved
	// the row's slot to its new DOM position — resting just under the collapsed
	// destination header (its hidden siblings render nothing). So the journey
	// starts translated back at the old position and ends one header-height UP
	// from rest: the group is collapsed, so the row's would-be slot is empty
	// space, and stopping there reads as overshooting — fading out ON the
	// header reads as being absorbed into it. Measured pre-paint (layout
	// effect) so the relocation is never visible. The exiting row's inner
	// `layout` is disabled via useIsPresent, so the measurement here is the
	// raw new DOM position, not a FLIP-transformed one.
	useLayoutEffect(() => {
		if (!transition || !isGroupCollapsed(transition.to)) return;
		const slotEl = rowEls.current.get(transition.id);
		const oldRect = rectsRef.current.get(`row:${transition.id}`);
		if (!slotEl || !oldRect) return;
		const startOffset = oldRect.top - slotEl.getBoundingClientRect().top;
		if (!Number.isFinite(startOffset)) return;
		// offsetHeight is transform-free, unlike a bounding rect mid-FLIP.
		const endOffset = -(
			headerEls.current.get(transition.to)?.offsetHeight ?? 0
		);
		if (Math.abs(startOffset - endOffset) < 4) return;
		slotEl.animate(
			[
				{ transform: `translateY(${startOffset}px)` },
				{ transform: `translateY(${endOffset}px)` },
			],
			{ duration: TRAVEL_DURATION_S * 1000, easing: TRAVEL_EASE_CSS },
		);
	});

	// Record positions after every commit; render N+1 reads commit N's values.
	useEffect(() => {
		const rects = new Map<string, { top: number; height: number }>();
		for (const [key, el] of headerEls.current) {
			const rect = el.getBoundingClientRect();
			rects.set(`header:${key}`, { top: rect.top, height: rect.height });
		}
		for (const [key, el] of rowEls.current) {
			const rect = el.getBoundingClientRect();
			rects.set(`row:${key}`, { top: rect.top, height: rect.height });
		}
		rectsRef.current = rects;
	});

	// Flatten groups into a single sibling list [header, row, row, header, …].
	// Because every row is a direct sibling inside one LayoutGroup (rather than
	// nested in per-group containers), a row keeps its React identity when it
	// moves to a different group — so framer-motion tweens it the whole way
	// instead of teleporting across containers.
	const items = useMemo(() => {
		const out: Array<
			| {
					kind: "header";
					key: string;
					group: (typeof groups)[number];
					collapseKey: string;
					isCollapsed: boolean;
			  }
			| {
					kind: "row";
					key: string;
					workspace: (typeof groups)[number]["workspaces"][number];
					groupKey: string;
					isCollapsed: boolean;
					shortcutLabel?: string;
			  }
		> = [];
		// ⌘N numbers follow the FLAT row order, collapsed rows included — same
		// as the real sidebar, whose first-9 numbering ignores collapse state so
		// the shortcuts stay stable while groups fold.
		let flatIndex = 0;
		for (const group of groups) {
			// Collapse keys are namespaced per group-by dimension so collapsing a
			// repository doesn't also collapse a same-keyed bucket in another view.
			const collapseKey = `${groupBy}:${group.key}`;
			const isCollapsed = group.label
				? Boolean(collapsedGroups[collapseKey])
				: false;
			if (group.label) {
				out.push({
					kind: "header",
					key: `header:${group.key}`,
					group,
					collapseKey,
					isCollapsed,
				});
			}
			for (const workspace of group.workspaces) {
				flatIndex += 1;
				out.push({
					kind: "row",
					key: workspace.id,
					workspace,
					groupKey: group.key,
					isCollapsed,
					shortcutLabel: flatIndex <= 9 ? `⌘${flatIndex}` : undefined,
				});
			}
		}
		return out;
	}, [groups, groupBy, collapsedGroups]);

	/**
	 * Travel roles for the row that just changed groups: an exit into a
	 * collapsed destination (positioning handled by the glide effect above), or
	 * an entrance from a collapsed origin header.
	 */
	const travelFor = (item: {
		key: string;
		workspace: { id: string };
		isCollapsed: boolean;
	}): { exitTravel: boolean; enterFromTop: number | null } => {
		if (!transition || item.workspace.id !== transition.id) {
			return { exitTravel: false, enterFromTop: null };
		}
		if (item.isCollapsed) {
			// Row is being hidden into a collapsed destination.
			return { exitTravel: true, enterFromTop: null };
		}
		if (isGroupCollapsed(transition.from)) {
			// Row is emerging from a collapsed origin — enter from its header.
			return {
				exitTravel: false,
				enterFromTop:
					rectsRef.current.get(`header:${transition.from}`)?.top ?? null,
			};
		}
		return { exitTravel: false, enterFromTop: null };
	};

	// Flat workspace-id order (headers excluded, collapsed rows INCLUDED so a
	// manualOrder snapshot never silently drops hidden workspaces) — the
	// sortable items, and the order committed as manualOrder on drop.
	const rowIds = useMemo(
		() => items.flatMap((item) => (item.kind === "row" ? [item.key] : [])),
		[items],
	);

	// ⌘1–⌘9 via the real registry ids (layout-aware, override-aware). Like the
	// real sidebar's useDashboardSidebarShortcuts, jumping reveals: the target's
	// group expands if it was collapsed.
	const jumpToIndex = (index: number) => {
		const id = rowIds[index];
		if (id) revealWorkspace(id);
	};
	useHotkey("JUMP_TO_WORKSPACE_1", () => jumpToIndex(0));
	useHotkey("JUMP_TO_WORKSPACE_2", () => jumpToIndex(1));
	useHotkey("JUMP_TO_WORKSPACE_3", () => jumpToIndex(2));
	useHotkey("JUMP_TO_WORKSPACE_4", () => jumpToIndex(3));
	useHotkey("JUMP_TO_WORKSPACE_5", () => jumpToIndex(4));
	useHotkey("JUMP_TO_WORKSPACE_6", () => jumpToIndex(5));
	useHotkey("JUMP_TO_WORKSPACE_7", () => jumpToIndex(6));
	useHotkey("JUMP_TO_WORKSPACE_8", () => jumpToIndex(7));
	useHotkey("JUMP_TO_WORKSPACE_9", () => jumpToIndex(8));

	// Fold-all toggle state: like the Changes toolbar's collapse/expand-all,
	// one button that collapses every group, flipping to expand-all once all
	// of them are collapsed.
	const groupCollapseKeys = useMemo(
		() =>
			groups
				.filter((group) => group.label)
				.map((group) => `${groupBy}:${group.key}`),
		[groups, groupBy],
	);
	const allGroupsCollapsed =
		groupCollapseKeys.length > 0 &&
		groupCollapseKeys.every((key) => collapsedGroups[key]);

	// Index span of each workspace's group within rowIds (groups are contiguous
	// slices), used to clamp drops inside the dragged row's own group.
	const groupBounds = useMemo(() => {
		const bounds = new Map<string, { start: number; end: number }>();
		let cursor = 0;
		for (const group of groups) {
			const start = cursor;
			const end = cursor + group.workspaces.length - 1;
			for (const workspace of group.workspaces) {
				bounds.set(workspace.id, { start, end });
			}
			cursor = end + 1;
		}
		return bounds;
	}, [groups]);

	// ── dnd-kit wiring (copied from the real DashboardSidebar) ────────────────
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const [activeRowId, setActiveRowId] = useState<string | null>(null);
	// Framer `layout` is off from drag start through the drop's commit render so
	// dnd-kit's transforms and framer's layout projection never animate the same
	// move; re-enabled one frame later, when positions are already settled.
	const [suppressLayout, setSuppressLayout] = useState(false);

	useEffect(() => {
		if (activeRowId !== null || !suppressLayout) return;
		const raf = requestAnimationFrame(() => setSuppressLayout(false));
		return () => cancelAnimationFrame(raf);
	}, [activeRowId, suppressLayout]);

	// The group currently under the pointer during a drag — drives the
	// destination-column highlight. A row id maps to its group; a `group:` id is
	// the group itself (an empty column, a collapsed header, or group padding).
	const [overGroupKey, setOverGroupKey] = useState<string | null>(null);

	const handleDragStart = ({ active }: DragStartEvent) => {
		setActiveRowId(String(active.id));
		setSuppressLayout(true);
	};

	const handleDragCancel = () => {
		setActiveRowId(null);
		setOverGroupKey(null);
	};

	const groupKeyForOver = (overId: string): string | null =>
		overId.startsWith(GROUP_DROP_ID_PREFIX)
			? overId.slice(GROUP_DROP_ID_PREFIX.length)
			: (groupKeyByWorkspace.get(overId) ?? null);

	const handleDragOver = ({ over }: DragOverEvent) => {
		setOverGroupKey(over ? groupKeyForOver(String(over.id)) : null);
	};

	// Under Linear grouping the whole group is a drop target, so prefer the
	// precise pointer hit: a row (for reordering / column identity) over the
	// group container beneath it. Other groupings keep dnd-kit's default.
	const collisionDetection: CollisionDetection = (args) => {
		if (groupBy !== "linear") return closestCenter(args);
		const hits = pointerWithin(args);
		if (hits.length === 0) return closestCenter(args);
		const rowHit = hits.find(
			(hit) => !String(hit.id).startsWith(GROUP_DROP_ID_PREFIX),
		);
		return rowHit ? [rowHit] : hits;
	};

	// Resolve the value setLinearStatus expects for a destination column key.
	// The "no-status" bucket's header hint is a display placeholder; its real
	// model value is null.
	const linearStatusForGroupKey = (groupKey: string) =>
		groupKey === "no-status"
			? null
			: (groups.find((group) => group.key === groupKey)?.linearStatus ?? null);

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		setActiveRowId(null);
		setOverGroupKey(null);
		if (!over) return;
		const activeId = String(active.id);
		const overId = String(over.id);

		if (groupBy === "linear") {
			// The whole group is a drop target: drop onto any of its rows, its
			// header, or (for an empty column) its drag-time drop area.
			const sourceGroup = groupKeyByWorkspace.get(activeId);
			const targetGroup = groupKeyForOver(overId);
			// Cross-column: reassign the workspace's Linear status. The view then
			// re-sorts it into the column per the active ordering — no manual-order
			// snapshot, so the Sort control is left untouched.
			if (targetGroup && targetGroup !== sourceGroup) {
				setLinearStatus(activeId, linearStatusForGroupKey(targetGroup));
				return;
			}
			// Same column: reorder within it (only when dropped over a sibling row).
			const from = rowIds.indexOf(activeId);
			const to = rowIds.indexOf(overId);
			if (from === -1 || to === -1 || from === to) return;
			commitManualOrder(arrayMove(rowIds, from, to));
			return;
		}

		// Repository / agent / PR groupings: reorder only, clamping a cross-group
		// drop back into the dragged row's own group — those properties aren't
		// drag-assignable (checks and reviews come from CI and reviewers).
		if (active.id === over.id) return;
		const from = rowIds.indexOf(activeId);
		let to = rowIds.indexOf(overId);
		if (from === -1 || to === -1) return;
		if (groupBy !== "none") {
			const bounds = groupBounds.get(activeId);
			if (!bounds) return;
			to = clamp(to, bounds.start, bounds.end);
		}
		if (from === to) return;
		// Snapshot the visual order with the move applied; auto-switches the sort
		// to Manual while keeping the current grouping.
		commitManualOrder(arrayMove(rowIds, from, to));
	};

	const activeItem = useMemo(
		() =>
			activeRowId
				? items.find((item) => item.kind === "row" && item.key === activeRowId)
				: undefined,
		[items, activeRowId],
	);
	const activeGroupKey =
		activeItem?.kind === "row" ? activeItem.groupKey : null;

	// The destination column to highlight: a different group hovered mid-drag,
	// under Linear grouping (the only group-by where a drop reassigns status).
	const dropTargetGroupKey =
		groupBy === "linear" &&
		activeRowId !== null &&
		overGroupKey !== null &&
		overGroupKey !== activeGroupKey
			? overGroupKey
			: null;

	const handleOrderByChange = (value: OrderBy) => {
		if (value === "manual" && orderBy !== "manual") {
			// Freeze the current visual order so nothing jumps when switching.
			commitManualOrder(rowIds);
			return;
		}
		setOrderBy(value);
	};

	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	// Which ViewSelect dropdown is open. Hoisted (rather than local to each
	// ViewSelect) so the hotkeys below can open a dropdown that isn't mounted
	// yet: reveal the panel first, then render it open.
	const [openSelect, setOpenSelect] = useState<"group" | "order" | null>(null);

	// ⌥G / ⌥O open the dropdown (visible options + arrow keys + type-ahead)
	// rather than blind-cycling — Linear's ⇧⌥G/⇧⌥O pattern, one modifier
	// shorter. ⌘G/⌘O are off the table: Run Workspace Command and Open in App
	// own them, and ⌘O is additionally an Electron File-menu accelerator that
	// fires in the main process before the renderer ever sees it. The reveal
	// chain makes them work from ANY collapsed state: rail → expanded sidebar,
	// tucked Projects panel / controls row → revealed, then the menu opens.
	const openViewSelect = (which: "group" | "order") => {
		if (sidebarCollapsed) toggleSidebarCollapsed();
		revealViewControls();
		setOpenSelect(which);
	};
	useLayoutAwareHotkey("alt+g", () => openViewSelect("group"));
	useLayoutAwareHotkey("alt+o", () => openViewSelect("order"));
	// ⇧⌥G toggles the whole Groups & ordering panel — the keyboard twin of the
	// LuLayers button. From the collapsed rail it expands the sidebar and reveals
	// the controls (same reveal chain as ⌥G/⌥O); otherwise it just flips the row.
	useLayoutAwareHotkey("shift+alt+g", () => {
		if (sidebarCollapsed) {
			toggleSidebarCollapsed();
			revealViewControls();
			return;
		}
		toggleViewControls();
	});
	// ⌥D / ⌥F act directly (no menu), so they skip the reveal: D = direction,
	// F = fold. Both respect their buttons' disabled states.
	useLayoutAwareHotkey("alt+d", () => {
		if (orderBy !== "manual") {
			setDirection(direction === "asc" ? "desc" : "asc");
		}
	});
	useLayoutAwareHotkey("alt+f", () => {
		if (groupCollapseKeys.length > 0) {
			setGroupsCollapsed(groupCollapseKeys, !allGroupsCollapsed);
		}
	});

	// Fully-collapsed rail, mirroring the real sidebar: a 52px column of size-8
	// icon buttons (workspace icon + status dot survive), with view controls,
	// grouping, and drag-reorder all disabled — the rail is fixed in place.
	if (sidebarCollapsed) {
		// The expand toggle is NOT here — like the real app, the collapsed rail is
		// too narrow for the traffic-light pad, so the toggle moves to the top bar
		// over the page content (PrototypeTopBar).
		return (
			// No border-r — the enclosing ResizablePanel draws the panel border.
			<div className="flex h-full flex-col items-center bg-muted/45 dark:bg-muted/35">
				<div className="drag h-12 w-full shrink-0" />
				<div className="no-drag mt-1 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-2 hide-scrollbar">
					{groups
						.flatMap((group) => group.workspaces)
						.map((workspace) => (
							<Tooltip key={workspace.id} delayDuration={300}>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => setActiveWorkspace(workspace.id)}
										className={cn(
											"relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
											workspace.id === activeWorkspaceId
												? "bg-accent"
												: "hover:bg-accent/50",
										)}
									>
										<DashboardSidebarWorkspaceIcon
											hostType={workspace.hostType}
											workspaceType={workspace.workspaceType}
											hostIsOnline={workspace.hostIsOnline}
											isActive={workspace.id === activeWorkspaceId}
											variant="collapsed"
											workspaceStatus={
												workspace.agentStatus === "idle"
													? null
													: workspace.agentStatus
											}
											isCreatePending={false}
											pullRequestState={workspace.pullRequest?.state ?? null}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="right" sideOffset={6}>
									<p className="text-xs">{workspace.title}</p>
								</TooltipContent>
							</Tooltip>
						))}
				</div>
				<PrototypeSidebarFooter isCollapsed />
			</div>
		);
	}

	return (
		// No border-r — the enclosing ResizablePanel draws the panel border.
		<div className="flex h-full flex-col bg-muted/45 dark:bg-muted/35">
			{/* Traffic-light row, matching the real sidebar header: a drag strip
			    with an 80px left inset that clears the macOS window controls
			    (titleBarStyle:hidden, lights at x/y = 16), hosting the collapse
			    toggle right beside them. h-12 centers the toggle on the lights
			    and matches PrototypeTopBar so the two headers read as one row. */}
			<div className="drag flex h-12 shrink-0 items-center pl-20">
				<PrototypeSidebarToggle />
			</div>
			{/* Real app chrome (live imports): org switcher + nav + New Workspace. */}
			<PrototypeSidebarHeader />
			{/* The Projects panel: view controls + grouped list collapse as one. */}
			<PrototypeProjectsHeader />
			{projectsCollapsed && <div className="flex-1" />}
			{!projectsCollapsed && (
				<>
					{/* Icon-only triggers: the selected option's label lives in the
					    hover tooltip instead of the trigger, so all four controls fit
					    on one row at every panel width — no truncation, no reflow
					    tiers. The whole row tucks away behind the Projects header's
					    LuLayers toggle once a view is set up. */}
					{!viewControlsCollapsed && (
						<div className="no-drag flex items-center gap-2 border-border/60 border-b px-3 pb-1.5">
							<ViewSelect
								value={groupBy}
								onChange={(v) => setGroupBy(v as GroupBy)}
								options={GROUP_BY_OPTIONS}
								conceptLabel="Group by"
								hotkeyKeys={["⌥", "G"]}
								open={openSelect === "group"}
								onOpenChange={(open) => setOpenSelect(open ? "group" : null)}
							/>
							<ViewSelect
								value={orderBy}
								onChange={(v) => handleOrderByChange(v as OrderBy)}
								options={ORDER_BY_OPTIONS}
								conceptLabel="Order by"
								hotkeyKeys={["⌥", "O"]}
								open={openSelect === "order"}
								onOpenChange={(open) => setOpenSelect(open ? "order" : null)}
							/>
							<div className="ml-auto flex shrink-0 items-center gap-2">
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<button
											type="button"
											// aria-disabled (not `disabled`) so the button stays
											// hoverable and its tooltip still explains the control
											// when Manual order makes direction moot — matching the
											// real app's disabled-with-tooltip pattern
											// (V2WorkspaceRow's "Can't unpin the current workspace").
											onClick={() => {
												if (orderBy === "manual") return;
												setDirection(direction === "asc" ? "desc" : "asc");
											}}
											aria-disabled={orderBy === "manual"}
											className={cn(
												"flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
												orderBy === "manual" &&
													"cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
											)}
										>
											{direction === "asc" ? (
												<LuArrowUpNarrowWide className="size-4" />
											) : (
												<LuArrowDownWideNarrow className="size-4" />
											)}
										</button>
									</TooltipTrigger>
									<TooltipContent side="bottom" sideOffset={4}>
										<p className="flex items-center gap-2 text-xs">
											{orderBy === "manual" ? (
												"Manual order has no direction"
											) : (
												<>
													{direction === "asc" ? "Ascending" : "Descending"}
													<KbdGroup>
														<Kbd>⌥</Kbd>
														<Kbd>D</Kbd>
													</KbdGroup>
												</>
											)}
										</p>
									</TooltipContent>
								</Tooltip>
								{/* Fold-all toggle, matching the Changes toolbar's collapse/
					    expand-all button: one control that folds every group, then
					    flips to unfold once everything is collapsed. */}
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<button
											type="button"
											onClick={() =>
												setGroupsCollapsed(
													groupCollapseKeys,
													!allGroupsCollapsed,
												)
											}
											disabled={groupCollapseKeys.length === 0}
											className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
										>
											{allGroupsCollapsed ? (
												<LuUnfoldVertical className="size-4" />
											) : (
												<LuFoldVertical className="size-4" />
											)}
										</button>
									</TooltipTrigger>
									<TooltipContent side="bottom" sideOffset={4}>
										<p className="flex items-center gap-2 text-xs">
											{allGroupsCollapsed ? "Expand all" : "Collapse all"}
											<KbdGroup>
												<Kbd>⌥</Kbd>
												<Kbd>F</Kbd>
											</KbdGroup>
										</p>
									</TooltipContent>
								</Tooltip>
							</div>
						</div>
					)}

					<motion.div
						layoutScroll
						className="hide-scrollbar flex-1 overflow-y-auto py-1"
					>
						<DndContext
							sensors={sensors}
							collisionDetection={collisionDetection}
							measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
							onDragStart={handleDragStart}
							onDragOver={handleDragOver}
							onDragEnd={handleDragEnd}
							onDragCancel={handleDragCancel}
						>
							<SortableContext
								items={rowIds}
								strategy={verticalListSortingStrategy}
							>
								<LayoutGroup>
									{items.map((item) => {
										if (item.kind === "header") {
											const flash = headerFlashes[item.group.key];
											const agentIcon = item.group.agentStatus
												? AGENT_GROUP_ICON[item.group.agentStatus]
												: undefined;
											const AgentStatusIcon = agentIcon?.icon;
											const prIcon = item.group.prBucket
												? PR_GROUP_ICON[item.group.prBucket]
												: undefined;
											const PrBucketIcon = prIcon?.icon;
											const isDropTarget =
												item.group.key === dropTargetGroupKey;
											const isEmptyColumn = item.group.workspaces.length === 0;
											return (
												// The whole group is a drop target under Linear grouping:
												// this wraps the header (and an empty column's drag-time
												// drop area) so a drop anywhere on the group reassigns
												// status. Disabled for other groupings.
												<PrototypeGroupDroppable
													key={item.key}
													groupKey={item.group.key}
													disabled={groupBy !== "linear"}
												>
													<motion.div
														ref={(el) => {
															if (el) headerEls.current.set(item.group.key, el);
															else headerEls.current.delete(item.group.key);
														}}
														layout={!sidebarResizing}
														role="button"
														tabIndex={0}
														onClick={() =>
															toggleGroupCollapsed(item.collapseKey)
														}
														onKeyDown={(event) => {
															if (event.key === "Enter" || event.key === " ") {
																event.preventDefault();
																toggleGroupCollapsed(item.collapseKey);
															}
														}}
														transition={{
															layout: {
																duration: 0.45,
																ease: [0.22, 1, 0.36, 1],
															},
														}}
														className={cn(
															"group relative w-full cursor-pointer py-1.5 pr-2 pl-3 font-medium text-[13px] text-muted-foreground transition-colors hover:bg-muted/50",
															isDropTarget && "bg-primary/10",
														)}
													>
														<HeaderFlashOverlay
															flashKey={flash?.seq ?? 0}
															delayMs={flash?.delayMs ?? 0}
															profile={flash?.profile ?? "hold"}
														/>
														<div className="relative z-10 flex min-h-5 w-full items-center gap-2">
															{/* Leading cell copied from the real project row: the
												    group icon at rest, swapped for the collapse chevron
												    on hover (rotate-90 when expanded). The rollup
												    status dot overlays the icon's top-right corner —
												    the same relative position as on workspace rows, so
												    it stays visible however narrow the panel gets. */}
															<div className="relative flex size-5 shrink-0 items-center justify-center">
																{item.group.repo ? (
																	<ProjectThumbnail
																		projectName={item.group.repo.name}
																		iconUrl={item.group.repo.iconUrl}
																		className="size-4 group-hover:hidden"
																	/>
																) : item.group.linearStatus ? (
																	<StatusIcon
																		type={item.group.linearStatus.iconType}
																		color={item.group.linearStatus.color}
																		progress={item.group.linearStatus.progress}
																		className="group-hover:hidden"
																	/>
																) : AgentStatusIcon && agentIcon ? (
																	<AgentStatusIcon
																		className={cn(
																			"size-4 group-hover:hidden",
																			agentIcon.className,
																		)}
																	/>
																) : PrBucketIcon && prIcon ? (
																	<PrBucketIcon
																		className={cn(
																			"size-4 group-hover:hidden",
																			prIcon.className,
																		)}
																	/>
																) : (
																	<span className="size-2 group-hover:hidden" />
																)}
																{/* The rollup notification dot only appears once the
													    group is collapsed — while it's expanded, each
													    workspace row already carries its own dot, so a
													    header rollup would just double the noise. It stays
												    visible through the hover icon→chevron swap: hiding
												    it would read as the activity having stopped. */}
																{item.isCollapsed &&
																	item.group.rollupStatus && (
																		<span className="-top-0.5 -right-0.5 absolute">
																			<StatusIndicator
																				status={item.group.rollupStatus}
																			/>
																		</span>
																	)}
																<HiChevronRight
																	className={cn(
																		"hidden size-4 text-muted-foreground transition-transform group-hover:block",
																		!item.isCollapsed && "rotate-90",
																	)}
																/>
															</div>
															<span className="truncate font-semibold">
																{item.group.label}
															</span>
															{item.group.repo ? (
																// Trailing cell copied from the real project row
																// (DashboardSidebarProjectRow): workspace count at
																// rest, swapped for the New-workspace plus on hover.
																// Repository groups only — the other group-bys
																// aren't a "place" a new workspace gets created in.
																<div className="ml-auto flex size-6 shrink-0 items-center justify-center">
																	<Tooltip delayDuration={500}>
																		<TooltipTrigger asChild>
																			<button
																				type="button"
																				onClick={(event) => {
																					event.stopPropagation();
																					openNewWorkspaceModal();
																				}}
																				onKeyDown={(event) =>
																					event.stopPropagation()
																				}
																				onContextMenu={(event) =>
																					event.stopPropagation()
																				}
																				aria-label="New workspace"
																				className="hidden size-full items-center justify-center rounded transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:flex group-has-[:focus]:flex"
																			>
																				<HiMiniPlus className="size-4 text-muted-foreground" />
																			</button>
																		</TooltipTrigger>
																		<TooltipContent
																			side="bottom"
																			sideOffset={4}
																		>
																			New workspace
																		</TooltipContent>
																	</Tooltip>
																	<span className="font-normal text-[10px] text-muted-foreground tabular-nums group-hover:hidden group-has-[:focus]:hidden">
																		{item.group.workspaces.length}
																	</span>
																</div>
															) : (
																<span className="ml-auto text-muted-foreground/70 text-xs tabular-nums">
																	{item.group.workspaces.length}
																</span>
															)}
														</div>
													</motion.div>
													{/* Empty columns get a drop area only while dragging —
												    at rest they're just a header, so the board stays
												    clean. It highlights when it's the drop target. */}
													{isEmptyColumn && activeRowId !== null && (
														<div
															className={cn(
																"mx-3 mt-0.5 mb-1 h-9 rounded-md border border-dashed transition-colors",
																isDropTarget
																	? "border-primary/60 bg-primary/5"
																	: "border-border/50",
															)}
														/>
													)}
												</PrototypeGroupDroppable>
											);
										}

										const travel = travelFor(item);
										return (
											<PrototypeTravelRow
												key={item.key}
												visible={!item.isCollapsed}
												exitTravel={travel.exitTravel}
												enterFromTop={travel.enterFromTop}
												highlighted={item.groupKey === dropTargetGroupKey}
												registerEl={(el) => {
													if (el) rowEls.current.set(item.key, el);
													else rowEls.current.delete(item.key);
												}}
											>
												<SortablePrototypeRow
													id={item.key}
													// Unlike the real sidebar, main workspaces are draggable
													// here — the prototype isn't bound by the pinned-main
													// behaviour, and Linear-group drags need to work for
													// every row.
													dragDisabled={false}
													// Cross-group droppables stay enabled under Linear
													// grouping (dropping there re-assigns the status);
													// repository/agent/PR groups disable them so drops
													// clamp to the source group — those properties aren't
													// drag-assignable (checks and reviews come from CI and
													// reviewers, not from the sidebar).
													droppableDisabled={
														activeGroupKey !== null &&
														(groupBy === "repository" ||
															groupBy === "agent" ||
															groupBy === "pr") &&
														item.groupKey !== activeGroupKey
													}
												>
													<PrototypeWorkspaceRow
														workspace={item.workspace}
														groupBy={groupBy}
														now={now}
														isActive={item.workspace.id === activeWorkspaceId}
														shortcutLabel={item.shortcutLabel}
														flashKey={
															lastChangedId === item.workspace.id
																? changeSeq
																: 0
														}
														layoutEnabled={!suppressLayout && !sidebarResizing}
														onClick={() =>
															setActiveWorkspace(item.workspace.id)
														}
													/>
												</SortablePrototypeRow>
											</PrototypeTravelRow>
										);
									})}
								</LayoutGroup>
							</SortableContext>
							{createPortal(
								<DragOverlay dropAnimation={null}>
									{activeItem?.kind === "row" && (
										<div className="border-border border-b bg-background shadow-lg">
											<PrototypeWorkspaceRow
												workspace={activeItem.workspace}
												groupBy={groupBy}
												now={now}
												isActive={activeItem.workspace.id === activeWorkspaceId}
												flashKey={0}
												layoutEnabled={false}
												onClick={() => {}}
											/>
										</div>
									)}
								</DragOverlay>,
								document.body,
							)}
						</DndContext>
					</motion.div>
				</>
			)}
			{/* Real app chrome (live imports): settings, updates pill, help. */}
			<PrototypeSidebarFooter />
		</div>
	);
}

function ViewSelect({
	value,
	onChange,
	options,
	conceptLabel,
	hotkeyKeys,
	open,
	onOpenChange,
}: {
	value: string;
	onChange: (value: string) => void;
	options: ViewOption[];
	conceptLabel: string;
	/** Display glyphs for the hotkey, shown as kbd chips in the tooltip. */
	hotkeyKeys: string[];
	/**
	 * Open state lives in the parent: the ⌥G/⌥O hotkeys are registered there
	 * so they can first reveal a tucked-away controls row, then mount this
	 * select already open.
	 */
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const selected = options.find((option) => option.value === value);
	// The trigger is icon-only, showing the SELECTED option's icon — no label,
	// so it never truncates at narrow panel widths. The hover tooltip carries
	// both the control's identity and the current value.
	const SelectedIcon = selected?.icon;

	// The tooltip is controlled and purely hover-driven. Left to Radix, closing
	// the select returns focus to the trigger, which re-opens the tooltip and
	// leaves it stuck open after the pointer moves away.
	const [hovered, setHovered] = useState(false);
	const hoverTimer = useRef<number | null>(null);

	const clearHoverTimer = () => {
		if (hoverTimer.current !== null) {
			window.clearTimeout(hoverTimer.current);
			hoverTimer.current = null;
		}
	};

	// Unmount cleanup only — inlined so the effect has no function dependency.
	useEffect(() => {
		return () => {
			if (hoverTimer.current !== null) {
				window.clearTimeout(hoverTimer.current);
			}
		};
	}, []);

	return (
		<Select
			value={value}
			onValueChange={onChange}
			open={open}
			onOpenChange={onOpenChange}
		>
			<Tooltip open={hovered && !open}>
				<TooltipTrigger asChild>
					<SelectTrigger
						size="sm"
						// data-[size=sm]:h-8 in the base classes outranks a plain h-* on
						// specificity, so the height override must use the same variant.
						className="shrink-0 border-border/60 bg-transparent px-2 text-xs data-[size=sm]:h-7"
						onPointerEnter={() => {
							clearHoverTimer();
							hoverTimer.current = window.setTimeout(
								() => setHovered(true),
								300,
							);
						}}
						onPointerLeave={() => {
							clearHoverTimer();
							setHovered(false);
						}}
					>
						{SelectedIcon && (
							<SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
						)}
					</SelectTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					<span className="flex items-center gap-2 text-xs">
						{/* With no label on the trigger, the tooltip names both the
						    control and its current value. */}
						{conceptLabel}
						{selected && (
							<span className="text-muted-foreground">{selected.label}</span>
						)}
						<KbdGroup>
							{hotkeyKeys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
					</span>
				</TooltipContent>
			</Tooltip>
			<SelectContent>
				{options.map((option, index) => (
					<Fragment key={option.value}>
						<SelectItem value={option.value}>
							<option.icon className="size-3.5" />
							{option.label}
						</SelectItem>
						{/* The leading "off"/manual option stands apart from the
						    alphabetical field options. */}
						{index === 0 && <SelectSeparator />}
					</Fragment>
				))}
			</SelectContent>
		</Select>
	);
}
