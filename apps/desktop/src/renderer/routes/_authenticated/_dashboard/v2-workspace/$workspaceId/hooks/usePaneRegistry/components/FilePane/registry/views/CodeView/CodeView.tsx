import { useCallback, useMemo, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	createPaneScrollStateKey,
	getPaneScrollState,
	savePaneScrollState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache";
import { useCopyPathWithLine } from "renderer/screens/main/components/WorkspaceView/ContentView/components";
import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";
import { CodeEditor, type CodeEditorAdapter } from "./components/CodeEditor";

export function CodeView({
	document,
	filePath,
	workspaceId,
	isActive,
}: ViewProps) {
	const editorRef = useRef<CodeEditorAdapter | null>(null);
	const getEditor = useCallback(() => editorRef.current, []);
	const copyPathWithLine = useCopyPathWithLine({ getEditor, filePath });
	useHotkey("COPY_PATH_WITH_LINE", copyPathWithLine, { enabled: isActive });

	// Quick Open replaces preview panes with new pane IDs, so the file path is
	// the stable editor identity when a user switches away and back.
	const scrollStateKey = useMemo(
		() =>
			createPaneScrollStateKey({
				workspaceId,
				viewId: "editor",
				resourceId: filePath,
			}),
		[workspaceId, filePath],
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
			editorRef={editorRef}
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
