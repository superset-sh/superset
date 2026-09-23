import type { RendererContext } from "@superset/panes";
import { useCallback, useRef } from "react";
import { useTerminalUrlPolicy } from "renderer/lib/clickPolicy";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import type { PagePaneData, PaneViewerData } from "../../../../types";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";
import { runUrlLinkAction } from "../../utils/runTerminalLinkAction";

interface PagePaneProps {
	data: PagePaneData;
	store: RendererContext<PaneViewerData>["store"];
	paneId: string;
	onDataChange: (data: PagePaneData) => void;
	/**
	 * Make this the active pane. Clicking anywhere in a pane activates it,
	 * but a click inside the page's iframe never reaches the pane's own
	 * handler, so the frame reports it and the pane activates itself.
	 */
	onFocus: () => void;
}

export function PagePane({
	data,
	store,
	paneId,
	onDataChange,
	onFocus,
}: PagePaneProps) {
	const urlPolicy = useTerminalUrlPolicy();
	const {
		commentsEnabled,
		setCommentsEnabled,
		previewVersion,
		setPreviewVersion,
	} = usePagePaneUi(paneId);

	const onDataChangeRef = useRef(onDataChange);
	onDataChangeRef.current = onDataChange;
	const dataRef = useRef(data);
	dataRef.current = data;

	const handleResolved = useCallback(
		(page: { id: string; slug: string; title: string | null }) => {
			const current = dataRef.current;
			const title = page.title ?? undefined;
			if (current.pageId === page.id && current.title === title) return;
			onDataChangeRef.current({ slug: page.slug, pageId: page.id, title });
		},
		[],
	);

	return (
		<PageViewer
			slug={data.slug}
			pageId={data.pageId}
			title={data.title}
			version={previewVersion}
			commentsEnabled={commentsEnabled}
			onCommentsEnabledChange={setCommentsEnabled}
			onResolved={handleResolved}
			onFramePointerDown={onFocus}
			onLinkClick={(click) => {
				const action = /^(mailto:|tel:)/i.test(click.url)
					? "external"
					: (urlPolicy.getAction(click) ??
						(!click.metaKey && !click.ctrlKey && !click.shiftKey
							? "pane"
							: null));
				if (action)
					runUrlLinkAction({ store, isPagesEnabled: true }, click.url, action);
			}}
			onExitPreview={() => setPreviewVersion(null)}
		/>
	);
}
