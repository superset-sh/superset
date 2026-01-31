import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LuFolderGit, LuFolderOpen, LuX } from "react-icons/lu";
import { useOpenFromPath, useOpenNew } from "renderer/react-query/projects";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { InitGitDialog } from "./InitGitDialog";

export function StartView() {
	const navigate = useNavigate();
	const openNew = useOpenNew();
	const openFromPath = useOpenFromPath();
	const [error, setError] = useState<string | null>(null);
	const [initGitDialog, setInitGitDialog] = useState<{
		isOpen: boolean;
		selectedPath: string;
	}>({ isOpen: false, selectedPath: "" });
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	const isLoading = openNew.isPending || openFromPath.isPending;

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), 5000);
		return () => clearTimeout(timer);
	}, [error]);

	useEffect(() => {
		const handleWindowDragEnd = () => setIsDragOver(false);
		const handleWindowDrop = () => setIsDragOver(false);

		window.addEventListener("dragend", handleWindowDragEnd);
		window.addEventListener("drop", handleWindowDrop);

		return () => {
			window.removeEventListener("dragend", handleWindowDragEnd);
			window.removeEventListener("drop", handleWindowDrop);
		};
	}, []);

	const handleOpenProject = () => {
		if (isDragOver) return;
		setError(null);
		openNew.mutate(undefined, {
			onSuccess: (result) => {
				if (result.canceled) {
					return;
				}

				if ("error" in result) {
					setError(result.error);
					return;
				}

				if ("needsGitInit" in result) {
					setInitGitDialog({
						isOpen: true,
						selectedPath: result.selectedPath,
					});
					return;
				}

				if ("project" in result && result.project) {
					navigate({
						to: "/project/$projectId",
						params: { projectId: result.project.id },
					});
				}
			},
			onError: (err) => {
				setError(err.message || "Failed to open project");
			},
		});
	};

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (e.dataTransfer.types.includes("Files")) {
			setIsDragOver(true);
			e.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

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

			if (isLoading) return;

			setError(null);

			const files = Array.from(e.dataTransfer.files);
			const firstFile = files[0];
			if (!firstFile) return;

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
							setInitGitDialog({
								isOpen: true,
								selectedPath: result.selectedPath,
							});
							return;
						}

						if ("project" in result && result.project) {
							navigate({
								to: "/project/$projectId",
								params: { projectId: result.project.id },
							});
						}
					},
					onError: (err) => {
						setError(err.message || "Failed to open project");
					},
				},
			);
		},
		[openFromPath, isLoading, navigate],
	);

	const handleCloneError = (errorMessage: string) => {
		setError(errorMessage);
	};

	return (
		<div className="flex flex-col h-full w-full relative overflow-hidden bg-background">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external files */}
			<div
				className="relative flex flex-1 items-center justify-center"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="flex flex-col items-center w-full max-w-xs px-4">
					<SupersetLogo
						className={cn(
							"h-8 w-auto mb-6 transition-opacity duration-200",
							isDragOver && "opacity-0",
						)}
					/>

					<div className="w-full flex flex-col gap-2">
						<div>
							<button
								type="button"
								onClick={handleOpenProject}
								disabled={isLoading}
								className={cn(
									"w-full rounded border border-dashed transition-colors",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									"disabled:opacity-50 disabled:pointer-events-none",
									isDragOver
										? "border-foreground/40 bg-accent/50 py-16"
										: "border-border bg-card px-4 py-7 hover:bg-accent",
								)}
							>
								{isDragOver ? (
									<div className="flex flex-col items-center gap-1">
										<LuFolderGit className="w-5 h-5 text-foreground" />
										<span className="text-sm text-foreground">
											Drop git project
										</span>
									</div>
								) : (
									<div className="flex-1 text-left">
										<LuFolderOpen className="w-4 h-4 text-muted-foreground" />
										<div className="text-sm pt-1 text-foreground">
											Open Project
										</div>
										<div className="text-xs pt-0.5 text-muted-foreground">
											Drag git folder or click to browse
										</div>
									</div>
								)}
							</button>
							<p
								className={cn(
									"mt-1.5 text-xs text-muted-foreground/60 text-center transition-opacity",
									isDragOver && "opacity-0",
								)}
							>
								Any folder with a .git directory
							</p>
						</div>

						<button
							type="button"
							onClick={() => setIsCloneDialogOpen(true)}
							disabled={isLoading || isDragOver}
							className={cn(
								"w-full rounded border border-border bg-transparent px-3 py-2",
								"transition-colors hover:bg-accent",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:opacity-50 disabled:pointer-events-none",
								isDragOver && "opacity-0",
							)}
						>
							<div className="flex items-center gap-3">
								<LuFolderGit className="w-4 h-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Clone Repository
								</span>
							</div>
						</button>
					</div>

					{error && !isDragOver && (
						<div className="mt-4 w-full flex items-start gap-2 rounded-md px-3 py-2 bg-destructive/10 border border-destructive/20">
							<span className="flex-1 text-xs text-destructive">{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								className="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive transition-colors"
								aria-label="Dismiss error"
							>
								<LuX className="h-3 w-3" />
							</button>
						</div>
					)}
				</div>
			</div>

			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>

			<CloneRepoDialog
				isOpen={isCloneDialogOpen}
				onClose={() => setIsCloneDialogOpen(false)}
				onError={handleCloneError}
			/>
		</div>
	);
}
