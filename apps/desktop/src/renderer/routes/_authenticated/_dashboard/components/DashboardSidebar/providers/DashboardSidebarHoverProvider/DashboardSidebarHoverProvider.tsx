import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { DashboardSidebarWorkspace } from "../../types";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 100;

export interface DashboardSidebarHoverPayload {
	workspace: DashboardSidebarWorkspace;
	onEditBranchClick: (branchName: string) => void;
}

interface HoverState {
	hoveredId: string | null;
	anchorElement: HTMLElement | null;
	payload: DashboardSidebarHoverPayload | null;
}

interface HoverContextValue {
	hoveredId: string | null;
	anchorElement: HTMLElement | null;
	payload: DashboardSidebarHoverPayload | null;
	contextMenuOpen: boolean;
	hoverCardSuppressed: boolean;
	requestOpen: (
		id: string,
		anchor: HTMLElement,
		payload: DashboardSidebarHoverPayload,
	) => void;
	requestClose: (id: string) => void;
	cancelClose: () => void;
	forceClose: () => void;
	setContextMenuOpen: (open: boolean) => void;
	beginHoverCardSuppression: () => void;
	endHoverCardSuppression: () => void;
	syncIfHovered: (id: string, payload: DashboardSidebarHoverPayload) => void;
}

const HoverContext = createContext<HoverContextValue | null>(null);

export function DashboardSidebarHoverProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [state, setState] = useState<HoverState>({
		hoveredId: null,
		anchorElement: null,
		payload: null,
	});
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	// Counted, not boolean: overlapping holds (chip trigger hovered while its
	// hover card is open, adjacent chips) must not release each other early.
	const [suppressionCount, setSuppressionCount] = useState(0);

	const beginHoverCardSuppression = useCallback(() => {
		setSuppressionCount((count) => count + 1);
	}, []);
	const endHoverCardSuppression = useCallback(() => {
		setSuppressionCount((count) => Math.max(0, count - 1));
	}, []);

	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearOpenTimer = useCallback(() => {
		if (openTimerRef.current) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
	}, []);
	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	const requestOpen = useCallback<HoverContextValue["requestOpen"]>(
		(id, anchor, payload) => {
			clearCloseTimer();
			if (stateRef.current.hoveredId !== null) {
				clearOpenTimer();
				setState({ hoveredId: id, anchorElement: anchor, payload });
				return;
			}
			clearOpenTimer();
			openTimerRef.current = setTimeout(() => {
				setState({ hoveredId: id, anchorElement: anchor, payload });
				openTimerRef.current = null;
			}, OPEN_DELAY_MS);
		},
		[clearCloseTimer, clearOpenTimer],
	);

	const requestClose = useCallback<HoverContextValue["requestClose"]>(
		(id) => {
			if (openTimerRef.current && stateRef.current.hoveredId === null) {
				// Pending open for this id — cancel it.
				clearOpenTimer();
				return;
			}
			if (stateRef.current.hoveredId !== id) return;
			clearCloseTimer();
			closeTimerRef.current = setTimeout(() => {
				setState({ hoveredId: null, anchorElement: null, payload: null });
				closeTimerRef.current = null;
			}, CLOSE_DELAY_MS);
		},
		[clearCloseTimer, clearOpenTimer],
	);

	const cancelClose = useCallback(() => {
		clearCloseTimer();
	}, [clearCloseTimer]);

	const forceClose = useCallback(() => {
		clearOpenTimer();
		clearCloseTimer();
		setState({ hoveredId: null, anchorElement: null, payload: null });
	}, [clearCloseTimer, clearOpenTimer]);

	const syncIfHovered = useCallback<HoverContextValue["syncIfHovered"]>(
		(id, payload) => {
			setState((prev) => {
				if (prev.hoveredId !== id) return prev;
				if (
					prev.payload?.workspace === payload.workspace &&
					prev.payload.onEditBranchClick === payload.onEditBranchClick
				) {
					return prev;
				}
				return { ...prev, payload };
			});
		},
		[],
	);

	useEffect(
		() => () => {
			clearOpenTimer();
			clearCloseTimer();
		},
		[clearCloseTimer, clearOpenTimer],
	);

	const value = useMemo<HoverContextValue>(
		() => ({
			hoveredId: state.hoveredId,
			anchorElement: state.anchorElement,
			payload: state.payload,
			contextMenuOpen,
			hoverCardSuppressed: suppressionCount > 0,
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			setContextMenuOpen,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
		}),
		[
			state.hoveredId,
			state.anchorElement,
			state.payload,
			contextMenuOpen,
			suppressionCount,
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
		],
	);

	return (
		<HoverContext.Provider value={value}>{children}</HoverContext.Provider>
	);
}

export function useDashboardSidebarHover() {
	const ctx = useContext(HoverContext);
	if (!ctx) {
		throw new Error(
			"useDashboardSidebarHover must be used inside DashboardSidebarHoverProvider",
		);
	}
	return ctx;
}
