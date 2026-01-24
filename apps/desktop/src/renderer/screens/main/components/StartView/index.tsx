import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LuFolderOpen, LuX } from "react-icons/lu";
import { useOpenFromPath, useOpenNew } from "renderer/react-query/projects";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo";
import { InitGitDialog } from "./InitGitDialog";
import { StartTopBar } from "./StartTopBar";

export function StartView() {
	const navigate = useNavigate();
	const openNew = useOpenNew();
	const openFromPath = useOpenFromPath();
	const [error, setError] = useState<string | null>(null);
	const [initGitDialog, setInitGitDialog] = useState<{
		isOpen: boolean;
		selectedPath: string;
	}>({ isOpen: false, selectedPath: "" });
	const [isDragOver, setIsDragOver] = useState(false);

	const isLoading = openNew.isPending || openFromPath.isPending;

	// Auto-dismiss error after 5 seconds
	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), 5000);
		return () => clearTimeout(timer);
	}, [error]);

	// Clear drag state when drag ends anywhere
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

				// Navigate to project view
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

						// Navigate to project view
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

	return (
		<div className="flex flex-col h-full w-full relative overflow-hidden bg-background">
			<StartTopBar />
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external files */}
			<div
				className="relative flex flex-1 items-center justify-center px-8 py-12"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="w-full max-w-md flex flex-col items-center gap-12">
					<div className="flex flex-col items-center gap-3 text-center">
						<span className="text-sm text-muted-foreground font-mono uppercase tracking-widest">
							Welcome to
						</span>
						<SupersetLogo className="h-12 w-auto" />
					</div>

					<div className="w-full items-center flex flex-col gap-3">
						<h4 className="scroll-m-20 text-xl font-semibold tracking-tight">
							Open a Project
						</h4>

						<button
							type="button"
							onClick={handleOpenProject}
							className={cn(
								"w-full rounded-xl bg-card border border-dashed",
								"flex flex-col items-center justify-center gap-5 px-8 py-16",
								"transition-colors duration-200",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								isDragOver ? "border-primary bg-primary/5" : "border-border",
							)}
						>
							<div
								className={cn(
									"rounded-2xl p-5",
									isDragOver
										? "bg-primary/10"
										: "bg-gradient-to-br from-muted to-muted/50",
								)}
							>
								<LuFolderOpen
									className={cn(
										"h-12 w-12",
										isDragOver ? "text-primary" : "text-foreground",
									)}
								/>
							</div>
							<div className="text-center">
								<p
									className={cn(
										"text-sm font-medium",
										isDragOver ? "text-primary" : "text-foreground",
									)}
								>
									{isDragOver
										? "Drop to open"
										: "Drag and drop a git folder to open"}
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									Any folder with a .git directory
								</p>
							</div>
						</button>
					</div>

					{error && (
						<div className="w-full flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive">
							<span className="flex-1 text-xs">{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
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
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>
		</div>
	);
}
