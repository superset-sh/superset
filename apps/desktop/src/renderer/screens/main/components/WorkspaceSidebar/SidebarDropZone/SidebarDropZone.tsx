import { cn } from "@superset/ui/utils";
import { type ReactNode, useCallback, useState } from "react";
import { LuFolderPlus } from "react-icons/lu";
import { useOpenFromPath } from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { InitGitDialog } from "../../StartView/InitGitDialog";

interface SidebarDropZoneProps {
	children: ReactNode;
	className?: string;
}

export function SidebarDropZone({ children, className }: SidebarDropZoneProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [initGitDialog, setInitGitDialog] = useState<{
		isOpen: boolean;
		selectedPath: string;
	}>({ isOpen: false, selectedPath: "" });

	const openFromPath = useOpenFromPath();
	const createBranchWorkspace = useCreateBranchWorkspace();

	const isProcessing =
		openFromPath.isPending || createBranchWorkspace.isPending;

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// Check if the drag contains files
		if (e.dataTransfer.types.includes("Files")) {
			setIsDragOver(true);
			e.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// Only set to false if we're leaving the drop zone entirely
		// (not just moving to a child element)
		const rect = e.currentTarget.getBoundingClientRect();
		const { clientX, clientY } = e;

		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			// Prevent multiple drops while processing
			if (isProcessing) return;

			setError(null);

			const files = Array.from(e.dataTransfer.files);

			// Get the first dropped item
			const firstFile = files[0];
			if (!firstFile) return;

			// In Electron with contextIsolation, use webUtils.getPathForFile to get the file path
			let filePath: string;
			try {
				filePath = window.webUtils.getPathForFile(firstFile);
			} catch {
				setError("Could not get path from dropped item");
				return;
			}

			if (!filePath) {
				setError("Could not get path from dropped item");
				return;
			}

			openFromPath.mutate(
				{ path: filePath },
				{
					onSuccess: (result) => {
						if ("canceled" in result && result.canceled) {
							return;
						}

						if ("error" in result) {
							setError(result.error);
							return;
						}

						if ("needsGitInit" in result) {
							// Show dialog to offer git initialization
							setInitGitDialog({
								isOpen: true,
								selectedPath: result.selectedPath,
							});
							return;
						}

						// Create a main workspace on the current branch
						if ("project" in result && result.project) {
							createBranchWorkspace.mutate(
								{ projectId: result.project.id },
								{
									onError: (err) => {
										setError(
											err.message ||
												"Project added but failed to create workspace",
										);
									},
								},
							);
						}
					},
					onError: (err) => {
						setError(err.message || "Failed to open project");
					},
				},
			);
		},
		[openFromPath, createBranchWorkspace, isProcessing],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external files
		<div
			className={cn("relative h-full", className)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{children}

			{/* Drop overlay */}
			{isDragOver && (
				<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 border-2 border-dashed border-primary rounded-lg m-1">
					<LuFolderPlus className="h-8 w-8 text-primary mb-2" />
					<span className="text-sm font-medium text-primary">
						{isProcessing ? "Processing..." : "Drop to add project"}
					</span>
				</div>
			)}

			{/* Processing indicator when not dragging */}
			{isProcessing && !isDragOver && (
				<div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80">
					<span className="text-sm text-muted-foreground">
						Adding project...
					</span>
				</div>
			)}

			{/* Error toast */}
			{error && (
				<div className="absolute bottom-4 left-4 right-4 z-50 bg-destructive/90 text-destructive-foreground text-xs px-3 py-2 rounded-md">
					{error}
					<button
						type="button"
						onClick={() => setError(null)}
						className="ml-2 underline"
					>
						Dismiss
					</button>
				</div>
			)}

			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>
		</div>
	);
}
