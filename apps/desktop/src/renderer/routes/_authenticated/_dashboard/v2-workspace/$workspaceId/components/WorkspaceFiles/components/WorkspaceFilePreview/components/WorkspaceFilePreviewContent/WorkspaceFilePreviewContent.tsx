import { useFileDocument } from "@superset/workspace-client";

interface WorkspaceFilePreviewContentProps {
	selectedFilePath: string;
	workspaceId: string;
}

export function WorkspaceFilePreviewContent({
	selectedFilePath,
	workspaceId,
}: WorkspaceFilePreviewContentProps) {
	const document = useFileDocument({
		workspaceId,
		absolutePath: selectedFilePath,
		mode: "auto",
	});

	if (document.state.kind === "loading") {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading file...
			</div>
		);
	}

	if (document.state.kind === "not-found") {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				File not found
			</div>
		);
	}

	if (document.state.kind === "binary") {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Binary files are not previewed yet
			</div>
		);
	}

	if (document.state.kind === "too-large") {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				File is too large to preview
			</div>
		);
	}

	if (document.state.kind === "bytes") {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Byte previews are not implemented yet
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<h2 className="truncate text-sm font-medium">
							{document.absolutePath}
						</h2>
						<p className="text-xs text-muted-foreground">
							Revision {document.state.revision}
						</p>
					</div>
					<button
						className="text-xs text-muted-foreground transition hover:text-foreground"
						onClick={() => void document.reload()}
						type="button"
					>
						Reload
					</button>
				</div>
				{document.hasExternalChange ? (
					<p className="mt-2 text-xs text-amber-600">
						File changed on disk. Reload to sync with the workspace.
					</p>
				) : null}
			</div>
			<pre className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4 text-xs leading-6 text-foreground">
				{document.state.content}
			</pre>
		</div>
	);
}
