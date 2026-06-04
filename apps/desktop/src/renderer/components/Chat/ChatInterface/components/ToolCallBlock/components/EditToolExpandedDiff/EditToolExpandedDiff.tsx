import { LightDiffViewer } from "renderer/screens/main/components/WorkspaceView/ChangesContent/components/LightDiffViewer";
import { useChangesStore } from "renderer/stores/changes";
import type { FileContents } from "shared/changes-types";

interface EditToolExpandedDiffProps {
	filePath: string;
	oldString: string;
	newString: string;
	hideUnchangedRegions?: boolean;
}

export function EditToolExpandedDiff({
	filePath,
	oldString,
	newString,
	hideUnchangedRegions,
}: EditToolExpandedDiffProps) {
	const viewMode = useChangesStore((state) => state.viewMode);
	const hideUnchangedRegionsFromStore = useChangesStore(
		(state) => state.hideUnchangedRegions,
	);
	const effectiveHideUnchangedRegions =
		hideUnchangedRegions ?? hideUnchangedRegionsFromStore;

	const contents: FileContents = {
		original: oldString,
		modified: newString,
		language: "text",
	};

	return (
		<LightDiffViewer
			contents={contents}
			viewMode={viewMode}
			hideUnchangedRegions={effectiveHideUnchangedRegions}
			filePath={filePath}
		/>
	);
}
