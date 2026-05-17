import { useVirtualizer, Virtualizer } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettings } from "renderer/stores/settings";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { useChangeset } from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { DiffFileEntry } from "./components/DiffFileEntry";

type DiffFocusSide = DiffPaneData["focusSide"];
const MAX_LINE_FOCUS_ATTEMPTS = 180;
const LINE_FOCUS_ESTIMATE_WAIT_ATTEMPTS = 12;
const ESTIMATED_DIFF_HEADER_HEIGHT_PX = 44;
const ESTIMATED_DIFF_LINE_HEIGHT_PX = 20;
const FOCUS_RENDERED_LINE_INDEX_ATTR = "data-focus-rendered-line-index";

function ScrollToFile({
	path,
	focusLine,
	focusSide,
	focusTick,
}: {
	path: string;
	focusLine?: number;
	focusSide?: DiffPaneData["focusSide"];
	focusTick?: number;
}) {
	const virtualizer = useVirtualizer();
	const lastScrolledPath = useRef<string | null>(null);
	const lastFocusTick = useRef<number | null>(null);

	useEffect(() => {
		if (!path || !virtualizer) return;
		const tickChanged =
			focusTick != null && focusTick !== lastFocusTick.current;
		const pathChanged = path !== lastScrolledPath.current;
		if (!pathChanged && !tickChanged) return;

		requestAnimationFrame(() => {
			const v = virtualizer as unknown as {
				getScrollContainerElement: () => HTMLElement | undefined;
				getOffsetInScrollContainer: (el: HTMLElement) => number;
			};
			const scrollContainer = v.getScrollContainerElement();
			if (!scrollContainer) return;

			const entry = scrollContainer.querySelector(
				`[data-diff-path="${CSS.escape(path)}"]`,
			) as HTMLElement | null;
			const header = scrollContainer.querySelector(
				`[data-diff-entry-header-path="${CSS.escape(path)}"]`,
			) as HTMLElement | null;
			if (!entry || !header) return;

			// Only seek to the line on a *new* focus request — without this
			// a path-only change would scroll to a stale focusLine.
			if (focusLine != null && tickChanged) {
				// Pierre's virtualizer mounts file content lazily; retry a
				// few frames so the target row has time to render.
				let attempts = 0;
				let fallbackEstimateDone = false;
				let estimatedRenderedLineIndex: number | undefined;
				const tryScroll = () => {
					const lineEl = findLineElement(entry, focusLine, focusSide);
					if (lineEl) {
						centerElementInScrollContainer(scrollContainer, v, lineEl);
						lastScrolledPath.current = path;
						lastFocusTick.current = focusTick;
						debugReviewDiffJump("focused line", {
							path,
							focusLine,
							focusSide,
							attempts,
						});
						return;
					}
					const renderedLineIndex = getFocusRenderedLineIndex(entry);
					const shouldUseRenderedEstimate =
						renderedLineIndex != null &&
						renderedLineIndex !== estimatedRenderedLineIndex;
					const shouldUseFallbackEstimate =
						renderedLineIndex == null &&
						!fallbackEstimateDone &&
						attempts >= LINE_FOCUS_ESTIMATE_WAIT_ATTEMPTS;
					if (shouldUseRenderedEstimate || shouldUseFallbackEstimate) {
						scrollToEstimatedLine(
							scrollContainer,
							v,
							header,
							focusLine,
							renderedLineIndex,
						);
						if (renderedLineIndex == null) {
							fallbackEstimateDone = true;
						} else {
							estimatedRenderedLineIndex = renderedLineIndex;
						}
						lastScrolledPath.current = path;
						debugReviewDiffJump("estimated line scroll", {
							path,
							focusLine,
							focusSide,
							renderedLineIndex,
							estimateSource:
								renderedLineIndex == null ? "source-line" : "rendered-index",
						});
					}
					if (attempts++ < MAX_LINE_FOCUS_ATTEMPTS) {
						requestAnimationFrame(tryScroll);
						return;
					}
					scrollToHeader(scrollContainer, v, header);
					lastScrolledPath.current = path;
					lastFocusTick.current = focusTick;
					debugReviewDiffJump("line target not found", {
						path,
						focusLine,
						focusSide,
					});
				};
				requestAnimationFrame(tryScroll);
				return;
			}

			scrollToHeader(scrollContainer, v, header);
			lastScrolledPath.current = path;
			if (focusTick != null) lastFocusTick.current = focusTick;
		});
	}, [path, focusLine, focusSide, focusTick, virtualizer]);

	return null;
}

type DiffVirtualizerApi = {
	getScrollContainerElement: () => HTMLElement | undefined;
	getOffsetInScrollContainer: (el: HTMLElement) => number;
};

function scrollToHeader(
	scrollContainer: HTMLElement,
	virtualizer: DiffVirtualizerApi,
	header: HTMLElement,
) {
	scrollContainer.scrollTo({
		top: virtualizer.getOffsetInScrollContainer(header),
	});
}

function scrollToEstimatedLine(
	scrollContainer: HTMLElement,
	virtualizer: DiffVirtualizerApi,
	header: HTMLElement,
	lineNumber: number,
	renderedLineIndex?: number,
) {
	const headerOffset = virtualizer.getOffsetInScrollContainer(header);
	const estimatedLineIndex = renderedLineIndex ?? Math.max(0, lineNumber - 1);
	const estimatedLineOffset =
		headerOffset +
		ESTIMATED_DIFF_HEADER_HEIGHT_PX +
		estimatedLineIndex * ESTIMATED_DIFF_LINE_HEIGHT_PX;
	scrollContainer.scrollTo({
		top: estimatedLineOffset - scrollContainer.clientHeight / 2,
	});
}

function getFocusRenderedLineIndex(entry: HTMLElement): number | undefined {
	const target = entry.querySelector(
		`[${FOCUS_RENDERED_LINE_INDEX_ATTR}]`,
	) as HTMLElement | null;
	if (!target) return undefined;
	const value = Number.parseInt(
		target.getAttribute(FOCUS_RENDERED_LINE_INDEX_ATTR) ?? "",
		10,
	);
	return Number.isFinite(value) ? value : undefined;
}

function centerElementInScrollContainer(
	scrollContainer: HTMLElement,
	virtualizer: DiffVirtualizerApi,
	element: HTMLElement,
) {
	const elementOffset = virtualizer.getOffsetInScrollContainer(element);
	const elementHeight = element.getBoundingClientRect().height;
	scrollContainer.scrollTo({
		top: elementOffset - scrollContainer.clientHeight / 2 + elementHeight / 2,
	});
}

function findLineElement(
	root: HTMLElement,
	lineNumber: number,
	focusSide?: DiffFocusSide,
): HTMLElement | null {
	// Pierre renders rows inside the diffs-container shadow root. Prefer the
	// rendered annotation row there; scrolling the light-DOM slotted React
	// wrapper can land on the host instead of the visual row.
	for (const container of root.querySelectorAll("diffs-container")) {
		const shadowRoot = container.shadowRoot;
		if (!shadowRoot) continue;

		const shadowTarget = findShadowLineElement(
			shadowRoot,
			lineNumber,
			focusSide,
		);
		if (shadowTarget) return shadowTarget;
	}

	// Light-DOM fallback for prerendered or future non-shadow renderers.
	const slotted = root.querySelector(
		`[slot$="-${lineNumber}"][slot^="annotation-"]`,
	) as HTMLElement | null;
	if (slotted) return slotted;
	const lineType =
		focusSide === "deletions"
			? "change-deletion"
			: focusSide === "additions"
				? "change-addition"
				: null;
	if (lineType) {
		const sideLine = root.querySelector(
			`[data-line="${lineNumber}"][data-line-type="${lineType}"]`,
		) as HTMLElement | null;
		if (sideLine) return sideLine;
	}
	return root.querySelector(
		`[data-line="${lineNumber}"]`,
	) as HTMLElement | null;
}

function findShadowLineElement(
	shadowRoot: ShadowRoot,
	lineNumber: number,
	focusSide?: DiffFocusSide,
): HTMLElement | null {
	const line = String(lineNumber);
	const slotSelector = focusSide
		? `slot[name="annotation-${focusSide}-${line}"]`
		: `slot[name$="-${line}"][name^="annotation-"]`;
	const slot = shadowRoot.querySelector(slotSelector);
	const annotationRow = slot?.closest("[data-line-annotation]");
	if (annotationRow instanceof HTMLElement) return annotationRow;

	if (focusSide) {
		const sideLine = shadowRoot.querySelector(
			`[data-${focusSide}] [data-line="${line}"]`,
		);
		if (sideLine instanceof HTMLElement) return sideLine;
	}

	const lineType =
		focusSide === "deletions"
			? "change-deletion"
			: focusSide === "additions"
				? "change-addition"
				: null;
	if (lineType) {
		const typedLine = shadowRoot.querySelector(
			`[data-line="${line}"][data-line-type="${lineType}"]`,
		);
		if (typedLine instanceof HTMLElement) return typedLine;
	}

	const lineElement = shadowRoot.querySelector(`[data-line="${line}"]`);
	return lineElement instanceof HTMLElement ? lineElement : null;
}

function debugReviewDiffJump(
	message: string,
	details: Record<string, unknown>,
) {
	if (
		typeof window === "undefined" ||
		window.localStorage.getItem("superset:review-diff-debug") !== "1"
	) {
		return;
	}
	console.debug(`[review-diff-jump] ${message}`, details);
}

interface DiffPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
}

export function DiffPane({ context, workspaceId, onOpenFile }: DiffPaneProps) {
	const data = context.pane.data as DiffPaneData;

	const diffStyle = useSettings((s) => s.diffStyle);
	const ref = useSidebarDiffRef(workspaceId);

	const { files, isLoading } = useChangeset({ workspaceId, ref });

	const { viewedSet, setViewed } = useViewedFiles(workspaceId);

	const openInExternalEditor = useOpenInExternalEditor(workspaceId);

	// O(1) collapsed lookup per child instead of Array.includes.
	const collapsedSet = useMemo(
		() => new Set(data.collapsedFiles ?? []),
		[data.collapsedFiles],
	);
	const expandedSet = useMemo(
		() => new Set(data.expandedFiles ?? []),
		[data.expandedFiles],
	);

	// Stable callback via refs — identity does not churn as collapsedFiles
	// updates, so memo'd children can skip re-renders on unrelated toggles.
	const dataRef = useRef(data);
	dataRef.current = data;
	const updateData = context.actions.updateData;
	const setCollapsed = useCallback(
		(path: string, value: boolean) => {
			const current = dataRef.current;
			const collapsed = current.collapsedFiles ?? [];
			const has = collapsed.includes(path);
			if (value === has) return;
			const next = value
				? [...collapsed, path]
				: collapsed.filter((p) => p !== path);
			updateData({ ...current, collapsedFiles: next } as PaneViewerData);
		},
		[updateData],
	);
	const setExpanded = useCallback(
		(path: string, value: boolean) => {
			const current = dataRef.current;
			const expanded = current.expandedFiles ?? [];
			const has = expanded.includes(path);
			if (value === has) return;
			const next = value
				? [...expanded, path]
				: expanded.filter((p) => p !== path);
			updateData({ ...current, expandedFiles: next } as PaneViewerData);
		},
		[updateData],
	);

	if (files.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				{isLoading ? "Loading…" : "No changes"}
			</div>
		);
	}

	return (
		<Virtualizer className="h-full w-full overflow-auto">
			<ScrollToFile
				path={data.path}
				focusLine={data.focusLine}
				focusSide={data.focusSide}
				focusTick={data.focusTick}
			/>
			{files.map((file) => (
				<DiffFileEntry
					key={`${file.source.kind}:${file.path}`}
					file={file}
					workspaceId={workspaceId}
					diffStyle={diffStyle}
					collapsed={
						file.path === data.path && data.focusLine != null
							? false
							: collapsedSet.has(file.path)
					}
					onSetCollapsed={setCollapsed}
					expanded={expandedSet.has(file.path)}
					onSetExpanded={setExpanded}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
					focusLine={file.path === data.path ? data.focusLine : undefined}
					focusSide={file.path === data.path ? data.focusSide : undefined}
					focusTick={file.path === data.path ? data.focusTick : undefined}
				/>
			))}
		</Virtualizer>
	);
}
