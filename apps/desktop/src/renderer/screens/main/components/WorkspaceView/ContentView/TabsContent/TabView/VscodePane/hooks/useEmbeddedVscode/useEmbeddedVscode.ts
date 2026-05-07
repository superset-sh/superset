import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useVscodeFocusStore } from "renderer/stores/vscode-focus";
import { reconcileOverlay } from "./reconcileOverlay";

export type VscodePhase =
	| "idle"
	| "starting"
	| "ready"
	| "cli-missing"
	| "failed";

interface Options {
	paneId: string;
	tabId: string;
	worktreePath: string;
	enabled?: boolean;
}

interface Result {
	containerRef: React.RefObject<HTMLDivElement | null>;
	phase: VscodePhase;
	errorMessage: string | null;
}

export function useEmbeddedVscode({
	paneId,
	tabId,
	worktreePath,
	enabled = true,
}: Options): Result {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [phase, setPhase] = useState<VscodePhase>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const isPaneFocused = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);

	const startMutation = electronTrpc.vscode.start.useMutation();
	const setBoundsMutation = electronTrpc.vscode.setBounds.useMutation();
	const setVisibleMutation = electronTrpc.vscode.setVisible.useMutation();
	const focusMutation = electronTrpc.vscode.focus.useMutation();
	const captureMutation = electronTrpc.vscode.capture.useMutation();

	const startRef = useRef(startMutation.mutateAsync);
	startRef.current = startMutation.mutateAsync;
	const setBoundsRef = useRef(setBoundsMutation.mutate);
	setBoundsRef.current = setBoundsMutation.mutate;
	const setVisibleRef = useRef(setVisibleMutation.mutate);
	setVisibleRef.current = setVisibleMutation.mutate;
	const focusRef = useRef(focusMutation.mutate);
	focusRef.current = focusMutation.mutate;
	const captureRef = useRef(captureMutation.mutateAsync);
	captureRef.current = captureMutation.mutateAsync;

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		setPhase("starting");
		setErrorMessage(null);
		startRef
			.current({ paneId, worktreePath })
			.then((result) => {
				if (cancelled) return;
				if (result.status === "ready") {
					setPhase("ready");
				} else if (result.status === "cli-missing") {
					setPhase("cli-missing");
				} else {
					setPhase("failed");
					setErrorMessage(result.error ?? "Failed to start VS Code server");
				}
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setPhase("failed");
				setErrorMessage(error instanceof Error ? error.message : String(error));
			});
		return () => {
			cancelled = true;
			setVisibleRef.current({ paneId, visible: false });
		};
	}, [paneId, worktreePath, enabled]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		if (phase !== "ready") return;

		const push = () => {
			const rect = el.getBoundingClientRect();
			setBoundsRef.current({
				paneId,
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
			});
		};
		push();

		// WebContentsView is a native OS-level view composited above all HTML in
		// the window, so no CSS z-index can put overlays on top of it. Hide the
		// view whenever a blocking Radix / cmdk / sonner overlay is open and
		// visually intersects the pane rect. Before each hide we snapshot the
		// view and paint it as the container's background image so overlays
		// render over a frozen IDE frame instead of the BrowserWindow bg color
		// flashing through. Tooltips stay out of the selector: they're
		// throwaway hover affordances where the capture+hide round-trip would
		// be heavier than the clipping it prevents.
		let currentVisible = false;
		let pendingVisible: boolean | null = null;
		let flushTimer: number | null = null;
		let rafHandle: number | null = null;
		// Monotonic counter so stale async work from superseded flushes
		// (e.g. a slow capture resolving after a newer show transition) can
		// short-circuit before mutating DOM or firing IPC.
		let flushGeneration = 0;
		const HIDE_DEBOUNCE_MS = 16;
		const clearBackdrop = () => {
			el.style.backgroundImage = "";
			el.style.backgroundSize = "";
			el.style.backgroundRepeat = "";
		};
		const paintBackdrop = (dataUrl: string) => {
			el.style.backgroundImage = `url("${dataUrl}")`;
			el.style.backgroundSize = "100% 100%";
			el.style.backgroundRepeat = "no-repeat";
		};
		const flush = () => {
			flushTimer = null;
			if (pendingVisible === null || pendingVisible === currentVisible) return;
			const myGen = ++flushGeneration;
			const nextVisible = pendingVisible;
			currentVisible = nextVisible;
			if (!nextVisible) {
				captureRef
					.current({ paneId })
					.then((result) => {
						if (myGen !== flushGeneration) return;
						if (result?.dataUrl) paintBackdrop(result.dataUrl);
						setVisibleRef.current({ paneId, visible: false });
					})
					.catch(() => {
						if (myGen !== flushGeneration) return;
						setVisibleRef.current({ paneId, visible: false });
					});
				return;
			}
			setVisibleRef.current({ paneId, visible: true });
			requestAnimationFrame(() => {
				if (myGen !== flushGeneration) return;
				clearBackdrop();
			});
		};
		const scheduleVisible = (visible: boolean, delayMs: number) => {
			pendingVisible = visible;
			if (flushTimer !== null) return;
			// Coalesce bursts of mutations (e.g. popper position/style updates)
			// into a single IPC call on the next tick.
			flushTimer = window.setTimeout(flush, delayMs);
		};
		// Broad selector: Radix poppers (dropdowns/popovers/menus/selects),
		// open dialogs, cmdk command menus, sonner toast items.
		const OVERLAY_SELECTOR = [
			"[data-radix-popper-content-wrapper]",
			'[role="dialog"][data-state="open"]',
			"[cmdk-root]",
			"[data-sonner-toast]",
		].join(", ");
		const reconcile = () => {
			const paneRect = el.getBoundingClientRect();
			const overlayEls =
				document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR);
			const overlays = Array.from(overlayEls, (overlay) => ({
				rect: overlay.getBoundingClientRect(),
				isTooltip: false,
			}));
			const result = reconcileOverlay({ paneRect, overlays });
			scheduleVisible(result.visible, HIDE_DEBOUNCE_MS);
		};
		// Two-pass reconcile: run immediately, then again after the next layout
		// frame. Radix poppers emit multiple style mutations while positioning;
		// the rAF pass catches the FINAL rect after layout/animation settle,
		// which eliminates the partial-clip bug where the native view hid
		// before the popper reached its final position.
		const reconcileTwoPass = () => {
			reconcile();
			if (rafHandle !== null) cancelAnimationFrame(rafHandle);
			rafHandle = requestAnimationFrame(() => {
				rafHandle = null;
				reconcile();
			});
		};
		reconcileTwoPass();

		const ro = new ResizeObserver(() => {
			push();
			reconcileTwoPass();
		});
		ro.observe(el);
		const onResize = () => {
			push();
			reconcileTwoPass();
		};
		const onScroll = () => {
			push();
			reconcileTwoPass();
		};
		window.addEventListener("resize", onResize);
		window.addEventListener("scroll", onScroll, true);

		// Radix and cmdk can emit many mutations per frame while a popper
		// settles (position updates + data-state flips + child renders). The
		// observer listens broadly — document.body subtree — because portals
		// mount as direct body children and we can't narrow further without
		// missing overlays. Collapse each burst to a single reconcile via rAF
		// so unrelated DOM churn across the app doesn't drive repeated
		// querySelectorAll + getBoundingClientRect passes.
		let moRafHandle: number | null = null;
		const scheduleMoReconcile = () => {
			if (moRafHandle !== null) return;
			moRafHandle = requestAnimationFrame(() => {
				moRafHandle = null;
				reconcileTwoPass();
			});
		};
		const mo = new MutationObserver(scheduleMoReconcile);
		mo.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-state"],
		});

		return () => {
			ro.disconnect();
			mo.disconnect();
			if (flushTimer !== null) window.clearTimeout(flushTimer);
			if (rafHandle !== null) cancelAnimationFrame(rafHandle);
			if (moRafHandle !== null) cancelAnimationFrame(moRafHandle);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("scroll", onScroll, true);
			// Any in-flight capture resolving after unmount must be ignored.
			flushGeneration++;
			clearBackdrop();
		};
	}, [paneId, phase]);

	useEffect(() => {
		if (phase !== "ready") return;
		if (!isPaneFocused) return;
		focusRef.current({ paneId });
	}, [paneId, phase, isPaneFocused]);

	electronTrpc.vscode.onStatus.useSubscription(
		{ paneId },
		{
			onData: (event) => {
				if (event.status === "exited" || event.status === "error") {
					setPhase("failed");
					setErrorMessage(event.error ?? "VS Code server exited unexpectedly");
				}
			},
		},
	);

	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setVscodeFocused = useVscodeFocusStore((s) => s.setFocused);
	const clearVscodeFocused = useVscodeFocusStore((s) => s.clearPane);
	electronTrpc.vscode.onFocus.useSubscription(undefined, {
		onData: (event) => {
			if (event.paneId !== paneId) return;
			setVscodeFocused(paneId, event.focused);
			if (event.focused) setFocusedPane(tabId, paneId);
		},
	});
	useEffect(() => {
		return () => {
			clearVscodeFocused(paneId);
		};
	}, [paneId, clearVscodeFocused]);

	return { containerRef, phase, errorMessage };
}
