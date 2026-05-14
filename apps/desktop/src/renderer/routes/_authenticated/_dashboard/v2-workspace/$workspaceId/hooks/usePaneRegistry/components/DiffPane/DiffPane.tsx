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

function ScrollToFile({
	path,
	focusLine,
	focusTick,
}: {
	path: string;
	focusLine?: number;
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

			const target = scrollContainer.querySelector(
				`[data-diff-path="${CSS.escape(path)}"]`,
			);
			if (!target) return;

			const offset = v.getOffsetInScrollContainer(target as HTMLElement);
			scrollContainer.scrollTo({ top: offset });
			lastScrolledPath.current = path;
			if (focusTick != null) lastFocusTick.current = focusTick;

			// Only seek to the line on a *new* focus request — without this
			// a path-only change would scroll to a stale focusLine.
			if (focusLine != null && tickChanged) {
				// Pierre's virtualizer mounts file content lazily; retry a
				// few frames so the annotation slot has time to render.
				let attempts = 0;
				const tryScroll = () => {
					const lineEl = findLineElement(target as HTMLElement, focusLine);
					if (lineEl) {
						lineEl.scrollIntoView({ block: "center" });
						return;
					}
					if (attempts++ < 20) requestAnimationFrame(tryScroll);
				};
				requestAnimationFrame(tryScroll);
			}
		});
	}, [path, focusLine, focusTick, virtualizer]);

	return null;
}

function findLineElement(
	root: HTMLElement,
	lineNumber: number,
): HTMLElement | null {
	// Prefer the Pierre annotation slot (`annotation-${side}-${line}`) —
	// it's in light DOM and sits exactly where the comment renders.
	// Fall back to the diff line itself when comments are hidden.
	const slotted = root.querySelector(
		`[slot$="-${lineNumber}"][slot^="annotation-"]`,
	) as HTMLElement | null;
	if (slotted) return slotted;
	return root.querySelector(
		`[data-line="${lineNumber}"]`,
	) as HTMLElement | null;
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
				focusTick={data.focusTick}
			/>
			{files.map((file) => (
				<DiffFileEntry
					key={`${file.source.kind}:${file.path}`}
					file={file}
					workspaceId={workspaceId}
					diffStyle={diffStyle}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
					expanded={expandedSet.has(file.path)}
					onSetExpanded={setExpanded}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
					focusLine={file.path === data.path ? data.focusLine : undefined}
					focusTick={file.path === data.path ? data.focusTick : undefined}
				/>
			))}
		</Virtualizer>
	);
}
