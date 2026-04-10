import { useVirtualizer, Virtualizer } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { useCallback, useEffect, useRef } from "react";
import { useSettings } from "renderer/stores/settings";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { useDiffPaneData } from "../../../useDiffPaneData";
import { WorkspaceDiff } from "./components/WorkspaceDiff";

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
	const { diffStyle, expandUnchanged } = useSettings();
	const { files } = useDiffPaneData({ workspaceId });

	const toggleFileCollapsed = useCallback(
		(filePath: string) => {
			const collapsed = data.collapsedFiles ?? [];
			const next = collapsed.includes(filePath)
				? collapsed.filter((p) => p !== filePath)
				: [...collapsed, filePath];
			context.actions.updateData({
				...data,
				collapsedFiles: next,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const allFiles = files.data?.files ?? [];
	const collapsedFiles = data.collapsedFiles ?? [];

	if (allFiles.length === 0 && !files.isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	return (
		<Virtualizer
			className="h-full w-full overflow-auto"
			contentClassName="space-y-2"
		>
			<ScrollToFile path={data.path} />
			{allFiles.map((file) => (
				<div key={`${file.category}:${file.path}`} data-diff-path={file.path}>
					<WorkspaceDiff
						workspaceId={workspaceId}
						path={file.path}
						category={file.category}
						diffStyle={diffStyle}
						expandUnchanged={expandUnchanged}
						collapsed={collapsedFiles.includes(file.path)}
						onToggleCollapsed={() => toggleFileCollapsed(file.path)}
					/>
				</div>
			))}
		</Virtualizer>
	);
}
