import { useCallback, useMemo } from "react";
import {
	createPaneScrollStateKey,
	getPaneScrollState,
	savePaneScrollState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache";
import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";
import { CodeEditor } from "./components/CodeEditor";

export function CodeView({
	document,
	filePath,
	workspaceId,
	paneId,
}: ViewProps) {
	const scrollStateKey = useMemo(
		() =>
			createPaneScrollStateKey({
				workspaceId,
				paneId,
				viewId: "editor",
				resourceId: filePath,
			}),
		[workspaceId, paneId, filePath],
	);
	const initialScrollPosition = useMemo(
		() => getPaneScrollState(scrollStateKey),
		[scrollStateKey],
	);
	const handleScrollPositionChange = useCallback(
		(position: { scrollTop: number; scrollLeft: number }) => {
			savePaneScrollState(scrollStateKey, position);
		},
		[scrollStateKey],
	);

	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<CodeEditor
			key={document.id}
			value={document.content.value}
			language={detectLanguage(filePath)}
			onChange={(next) => document.setContent(next)}
			onSave={() => void document.save()}
			initialScrollPosition={initialScrollPosition}
			onScrollPositionChange={handleScrollPositionChange}
			fillHeight
		/>
	);
}
