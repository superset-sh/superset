import { useVirtualizer, Virtualizer } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useSettings } from "renderer/stores/settings";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { type DiffCategory, useChangeset } from "../../../useChangeset";
import { useViewedFiles } from "../../../useViewedFiles";
import { DiffFileEntry } from "./components/DiffFileEntry";

function useSidebarDiffCategory(workspaceId: string): DiffCategory {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const filter = rows[0]?.sidebarState?.changesFilter;
	return filter?.kind === "uncommitted" ? "unstaged" : "against-base";
}

function ScrollToFile({ path }: { path: string }) {
	const virtualizer = useVirtualizer();
	const lastScrolledPath = useRef<string | null>(null);

	useEffect(() => {
		if (!path || path === lastScrolledPath.current || !virtualizer) return;
		lastScrolledPath.current = path;

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
		});
	}, [path, virtualizer]);

	return null;
}

interface DiffPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function DiffPane({ context, workspaceId }: DiffPaneProps) {
	const data = context.pane.data as DiffPaneData;

	const diffStyle = useSettings((s) => s.diffStyle);
	const category = useSidebarDiffCategory(workspaceId);

	const { files, isLoading } = useChangeset({
		workspaceId,
		category,
	});

	const { viewedSet, setViewed } = useViewedFiles(workspaceId);

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
					key={`${file.category}:${file.path}`}
					file={file}
					workspaceId={workspaceId}
					diffStyle={diffStyle}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
				/>
			))}
		</Virtualizer>
	);
}
