import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LuFolderGit, LuFolderOpen, LuX } from "react-icons/lu";
import {
	processOpenNewResults,
	useOpenFromPath,
	useOpenNew,
} from "renderer/react-query/projects";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo";
import { InitGitDialog } from "./InitGitDialog";
import { NewProjectDialog } from "./NewProjectDialog";

export function StartView() {
	const navigate = useNavigate();
	const openNew = useOpenNew();
	const openFromPath = useOpenFromPath();
	const [error, setError] = useState<string | null>(null);
	const [initGitDialog, setInitGitDialog] = useState<{
		isOpen: boolean;
		selectedPath: string;
		selectedPaths?: string[];
	}>({ isOpen: false, selectedPath: "" });
	const [pendingNavigateProjectId, setPendingNavigateProjectId] = useState<
		string | null
	>(null);
	const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
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

				if ("results" in result) {
					const { successes, needsGitInit } = processOpenNewResults({
						results: result.results,
					});

					const firstProjectId = successes[0]?.project.id;

					if (needsGitInit.length > 0) {
						const paths = needsGitInit.map((r) => r.selectedPath);
						// Defer navigation until git-init dialog is closed
						if (firstProjectId) {
							setPendingNavigateProjectId(firstProjectId);
						}
						setInitGitDialog({
							isOpen: true,
							selectedPath: paths[0],
							selectedPaths: paths,
						});
					} else if (firstProjectId) {
						navigate({
							to: "/project/$projectId",
							params: { projectId: firstProjectId },
							replace: true,
						});
					}

					return;
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
								replace: true,
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

	const handleNewProjectError = (errorMessage: string) => {
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
				<div className="flex flex-col items-center w-full max-w-md px-6">
					<SupersetLogo
						className={cn(
							"h-8 w-auto mb-12 transition-opacity duration-200 opacity-80",
							isDragOver && "opacity-0",
						)}
					/>

					<div className="w-full flex flex-col gap-4">
						<div>
							<button
								type="button"
								onClick={handleOpenProject}
								disabled={isLoading}
								className={cn(
									"w-full rounded-xl border-2 border-dashed transition-all duration-200",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
									"disabled:opacity-50 disabled:pointer-events-none",
									isDragOver
										? "border-primary/60 bg-primary/5 py-32 scale-[1.02]"
										: "border-border/60 bg-card/50 px-6 py-16 hover:border-primary/40 hover:bg-accent/50",
								)}
							>
								{isDragOver ? (
									<div className="flex flex-col items-center gap-3">
										<LuFolderGit className="w-10 h-10 text-primary" />
										<span className="text-lg font-medium text-foreground">
											Drop git project
										</span>
									</div>
								) : (
									<div className="flex flex-col items-center group">
										<div className="flex items-center gap-3">
											<LuFolderOpen className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
											<span className="text-lg font-medium text-foreground">
												Open Project
											</span>
										</div>
										<div className="text-sm pt-3 text-muted-foreground">
											Drag a folder with .git or click to browse
										</div>
									</div>
								)}
							</button>
						</div>

						<div
							className={cn(
								"flex items-center justify-center gap-2 transition-opacity pt-2",
								isDragOver && "opacity-0",
							)}
						>
							<span className="text-sm text-muted-foreground">
								Or start a new project
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIsNewProjectDialogOpen(true)}
								disabled={isLoading}
								className="text-sm"
							>
								New Project
							</Button>
						</div>
					</div>

					{error && !isDragOver && (
						<div className="mt-5 w-full flex items-start gap-2 rounded-md px-4 py-3 bg-destructive/10 border border-destructive/20">
							<span className="flex-1 text-sm text-destructive">{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								className="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive transition-colors"
								aria-label="Dismiss error"
							>
								<LuX className="h-3.5 w-3.5" />
							</button>
						</div>
					)}
				</div>
			</div>

			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				selectedPaths={initGitDialog.selectedPaths}
				onClose={() => {
					setInitGitDialog({ isOpen: false, selectedPath: "" });
					if (pendingNavigateProjectId) {
						navigate({
							to: "/project/$projectId",
							params: { projectId: pendingNavigateProjectId },
							replace: true,
						});
						setPendingNavigateProjectId(null);
					}
				}}
				onError={(msg) => {
					setError(msg);
					setPendingNavigateProjectId(null);
				}}
			/>

			<NewProjectDialog
				isOpen={isNewProjectDialogOpen}
				onClose={() => setIsNewProjectDialogOpen(false)}
				onError={handleNewProjectError}
			/>
		</div>
	);
}
