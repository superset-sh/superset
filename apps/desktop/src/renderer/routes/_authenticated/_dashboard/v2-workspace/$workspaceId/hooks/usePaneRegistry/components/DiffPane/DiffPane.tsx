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

function ScrollToFile({ path }: { path: string }) {
	const virtualizer = useVirtualizer();
	const lastScrolledPath = useRef<string | null>(null);

	useEffect(() => {
		if (!path || path === lastScrolledPath.current || !virtualizer) return;

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
		});
	}, [path, virtualizer]);

	return null;
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

	if (!isLoading && files.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	return (
		<Virtualizer
			className="h-full w-full overflow-auto"
			contentClassName="space-y-2 px-2 py-2"
		>
			<ScrollToFile path={data.path} />
			{files.map((file) => (
				<DiffFileEntry
					key={`${file.source.kind}:${file.path}`}
					file={file}
					workspaceId={workspaceId}
					diffStyle={diffStyle}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
				/>
			))}
		</Virtualizer>
	);
}
