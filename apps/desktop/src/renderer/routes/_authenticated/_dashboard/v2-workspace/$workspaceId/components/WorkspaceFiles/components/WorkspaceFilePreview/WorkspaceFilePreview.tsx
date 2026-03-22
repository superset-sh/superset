import { WorkspaceFilePreviewContent } from "./components/WorkspaceFilePreviewContent";

interface WorkspaceFilePreviewProps {
	selectedFilePath?: string;
	workspaceId: string;
}

export function WorkspaceFilePreview({
	selectedFilePath,
	workspaceId,
}: WorkspaceFilePreviewProps) {
	if (!selectedFilePath) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a file to preview it
			</div>
		);
	}

	return (
		<WorkspaceFilePreviewContent
			selectedFilePath={selectedFilePath}
			workspaceId={workspaceId}
		/>
	);
}
