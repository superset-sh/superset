import { MultiFileDiff } from "@pierre/diffs/react";
import type { ToolContent } from "@superset/chat/protocol";
import { useMemo } from "react";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import { diffStats } from "../../../../utils/diffStats";
import { DetailScroll } from "../DetailScroll";
import { DiffCardHeader } from "./components/DiffCardHeader";

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

const CHAT_DIFF_FONT_SIZE = 12;

/** The renderer's shadow tree does not inherit the transcript's opt-in. */
const SELECTABLE_CSS = "* { user-select: text; -webkit-user-select: text; }";

/**
 * One file's change as a card: a header that stays put, and under it the
 * same diff renderer the PR pane uses, folded to the changed regions, in a
 * box that follows the bottom while the agent is still writing the file.
 */
export function DiffContent({
	content,
	streaming = false,
}: {
	content: DiffToolContent;
	streaming?: boolean;
}) {
	const activeTheme = useResolvedTheme();
	const stats = useMemo(() => diffStats(content), [content]);
	const contentKey = [
		content.path,
		content.oldText ?? "",
		content.newText,
	].join("\0");
	return (
		<DetailScroll
			className="mt-1"
			contentKey={contentKey}
			scrollClassName="rounded-lg border border-border/60 bg-background"
			streaming={streaming}
		>
			<DiffCardHeader path={content.path} stats={stats} />
			<MultiFileDiff
				newFile={{ name: content.path, contents: content.newText }}
				oldFile={{ name: content.path, contents: content.oldText ?? "" }}
				options={{
					diffStyle: "unified",
					expandUnchanged: false,
					theme: getDiffsTheme(activeTheme),
					themeType: activeTheme.type,
					overflow: "wrap",
					disableFileHeader: true,
					unsafeCSS: SELECTABLE_CSS,
				}}
				style={getDiffViewerStyle(activeTheme, {
					fontSize: CHAT_DIFF_FONT_SIZE,
				})}
			/>
		</DetailScroll>
	);
}
