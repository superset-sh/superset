import { LightDiffViewer } from "renderer/screens/main/components/WorkspaceView/ChangesContent/components/LightDiffViewer";
import { useChangesStore } from "renderer/stores/changes";
import type { FileContents } from "shared/changes-types";

interface EditToolExpandedDiffProps {
	filePath: string;
	oldString: string;
	newString: string;
}

export function EditToolExpandedDiff({
	filePath,
	oldString,
	newString,
}: EditToolExpandedDiffProps) {
	const viewMode = useChangesStore((state) => state.viewMode);
	const hideUnchangedRegions = useChangesStore(
		(state) => state.hideUnchangedRegions,
	);

	const contents: FileContents = {
		original: oldString,
		modified: newString,
		language: "text",
	};

	return (
		<LightDiffViewer
			contents={contents}
			viewMode={viewMode}
			hideUnchangedRegions={hideUnchangedRegions}
			filePath={filePath}
		/>
	);
}
