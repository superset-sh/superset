import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { LuFolderPlus, LuLoader, LuX } from "react-icons/lu";
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

	// Auto-dismiss error after 5 seconds
	useEffect(() => {
		if (!error) return;

		const timer = setTimeout(() => {
			setError(null);
		}, 5000);

		return () => clearTimeout(timer);
	}, [error]);

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

			<AnimatePresence>
				{/* Drop overlay */}
				{isDragOver && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="absolute inset-0 z-50 flex flex-col items-center justify-center m-2 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 backdrop-blur-sm"
					>
						<motion.div
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.8, opacity: 0 }}
							transition={{ duration: 0.15, delay: 0.05 }}
							className="flex flex-col items-center gap-3"
						>
							<div className="rounded-full bg-primary/10 p-3">
								<LuFolderPlus className="h-6 w-6 text-primary" />
							</div>
							<div className="text-center">
								<p className="text-sm font-medium text-primary">
									Drop to add project
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									Release to open folder
								</p>
							</div>
						</motion.div>
					</motion.div>
				)}

				{/* Processing indicator when not dragging */}
				{isProcessing && !isDragOver && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm"
					>
						<div className="flex flex-col items-center gap-3">
							<LuLoader className="h-5 w-5 text-muted-foreground animate-spin" />
							<span className="text-sm text-muted-foreground">
								Adding project...
							</span>
						</div>
					</motion.div>
				)}

				{/* Error toast - auto-dismisses after 5s or can be manually dismissed */}
				{error && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						transition={{ duration: 0.2 }}
						className="absolute bottom-3 left-3 right-3 z-50 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive shadow-sm"
					>
						<span className="flex-1 text-xs">{error}</span>
						<button
							type="button"
							onClick={() => setError(null)}
							className="shrink-0 rounded p-0.5 hover:bg-destructive/20 transition-colors"
							aria-label="Dismiss error"
						>
							<LuX className="h-3.5 w-3.5" />
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>
		</div>
	);
}
