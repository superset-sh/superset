import type { SharedFileDocument } from "../../../../../../../state/fileDocumentStore";
import type { FilePaneData } from "../../../../../../../types";
import { ALL_VIEWS } from "../../allViews";
import { pickDefaultView, resolveViews } from "../../resolveViews";
import type { FileMeta, FileView } from "../../types";

export interface ActivePaneView {
	views: FileView[];
	activeView: FileView | null;
}

/**
 * Resolve the list of views available for a given pane's file plus the one
 * currently active. Consumed by both the FilePane body and FilePaneHeaderExtras
 * so the toggle and the rendered view stay in lockstep.
 */
export function resolveActivePaneView(
	document: SharedFileDocument,
	data: FilePaneData,
): ActivePaneView {
	const meta: FileMeta = {
		size: document.byteSize ?? undefined,
		isBinary: document.isBinary ?? undefined,
	};
	const views = data.forceViewId
		? ALL_VIEWS.filter((v) => v.id === data.forceViewId)
		: resolveViews(data.filePath, meta);
	const activeView =
		views.find((v) => v.id === data.viewId) ?? pickDefaultView(views);
	return { views, activeView };
}
