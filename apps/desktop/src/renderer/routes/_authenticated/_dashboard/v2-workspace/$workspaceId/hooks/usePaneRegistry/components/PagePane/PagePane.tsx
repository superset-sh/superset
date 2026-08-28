import { useCallback, useRef } from "react";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import type { PagePaneData } from "../../../../types";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";

interface PagePaneProps {
	data: PagePaneData;
	paneId: string;
	onDataChange: (data: PagePaneData) => void;
}

export function PagePane({ data, paneId, onDataChange }: PagePaneProps) {
	const { commentsEnabled, setCommentsEnabled } = usePagePaneUi(paneId);

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
			commentsEnabled={commentsEnabled}
			onCommentsEnabledChange={setCommentsEnabled}
			onResolved={handleResolved}
		/>
	);
}
