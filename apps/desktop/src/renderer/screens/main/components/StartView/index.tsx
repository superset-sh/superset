import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { LuFolderOpen, LuLoader, LuX } from "react-icons/lu";
import { useOpenFromPath, useOpenNew } from "renderer/react-query/projects";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { InitGitDialog } from "./InitGitDialog";
import { StartTopBar } from "./StartTopBar";

export function StartView() {
	const navigate = useNavigate();
	const openNew = useOpenNew();
	const openFromPath = useOpenFromPath();
	const [error, setError] = useState<string | null>(null);
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
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
		<div className="flex flex-col h-full w-full bg-background">
			<StartTopBar />
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external files */}
			<div
				className="flex flex-1 items-center justify-center p-8"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="flex flex-col items-center w-full max-w-md">
					{/* Logo */}
					<div className="mb-8">
						<svg
							width="282"
							height="46"
							viewBox="0 0 282 46"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							className="w-auto h-10"
							role="img"
							aria-labelledby="superset-logo-title"
						>
							<title id="superset-logo-title">Superset</title>
							<path
								d="M18.1818 4.30346e-05H27.2727V9.09095H18.1818V4.30346e-05ZM9.09091 4.30346e-05H18.1818V9.09095H9.09091V4.30346e-05ZM0 9.09095H9.09091V18.1819H0V9.09095ZM0 18.1819H9.09091V27.2728H0V18.1819ZM9.09091 18.1819H18.1818V27.2728H9.09091V18.1819ZM18.1818 18.1819H27.2727V27.2728H18.1818V18.1819ZM18.1818 27.2728H27.2727V36.3637H18.1818V27.2728ZM18.1818 36.3637H27.2727V45.4546H18.1818V36.3637ZM9.09091 36.3637H18.1818V45.4546H9.09091V36.3637ZM0 36.3637H9.09091V45.4546H0V36.3637ZM0 4.30346e-05H9.09091V9.09095H0V4.30346e-05ZM36.3281 4.30346e-05H45.419V9.09095H36.3281V4.30346e-05ZM36.3281 9.09095H45.419V18.1819H36.3281V9.09095ZM36.3281 18.1819H45.419V27.2728H36.3281V18.1819ZM36.3281 27.2728H45.419V36.3637H36.3281V27.2728ZM36.3281 36.3637H45.419V45.4546H36.3281V36.3637ZM45.419 36.3637H54.5099V45.4546H45.419V36.3637ZM54.5099 36.3637H63.6009V45.4546H54.5099V36.3637ZM54.5099 27.2728H63.6009V36.3637H54.5099V27.2728ZM54.5099 18.1819H63.6009V27.2728H54.5099V18.1819ZM54.5099 9.09095H63.6009V18.1819H54.5099V9.09095ZM54.5099 4.30346e-05H63.6009V9.09095H54.5099V4.30346e-05ZM72.6562 4.30346e-05H81.7472V9.09095H72.6562V4.30346e-05ZM72.6562 9.09095H81.7472V18.1819H72.6562V9.09095ZM72.6562 18.1819H81.7472V27.2728H72.6562V18.1819ZM72.6562 27.2728H81.7472V36.3637H72.6562V27.2728ZM72.6562 36.3637H81.7472V45.4546H72.6562V36.3637ZM81.7472 4.30346e-05H90.8381V9.09095H81.7472V4.30346e-05ZM90.8381 4.30346e-05H99.929V9.09095H90.8381V4.30346e-05ZM90.8381 9.09095H99.929V18.1819H90.8381V9.09095ZM90.8381 18.1819H99.929V27.2728H90.8381V18.1819ZM81.7472 18.1819H90.8381V27.2728H81.7472V18.1819ZM108.984 4.30346e-05H118.075V9.09095H108.984V4.30346e-05ZM108.984 9.09095H118.075V18.1819H108.984V9.09095ZM108.984 18.1819H118.075V27.2728H108.984V18.1819ZM108.984 27.2728H118.075V36.3637H108.984V27.2728ZM108.984 36.3637H118.075V45.4546H108.984V36.3637ZM118.075 4.30346e-05H127.166V9.09095H118.075V4.30346e-05ZM118.075 36.3637H127.166V45.4546H118.075V36.3637ZM118.075 18.1819H127.166V27.2728H118.075V18.1819ZM127.166 4.30346e-05H136.257V9.09095H127.166V4.30346e-05ZM127.166 36.3637H136.257V45.4546H127.166V36.3637ZM145.312 36.3637H154.403V45.4546H145.312V36.3637ZM145.312 27.2728H154.403V36.3637H145.312V27.2728ZM145.312 18.1819H154.403V27.2728H145.312V18.1819ZM145.312 9.09095H154.403V18.1819H145.312V9.09095ZM145.312 4.30346e-05H154.403V9.09095H145.312V4.30346e-05ZM154.403 4.30346e-05H163.494V9.09095H154.403V4.30346e-05ZM163.494 4.30346e-05H172.585V9.09095H163.494V4.30346e-05ZM163.494 9.09095H172.585V18.1819H163.494V9.09095ZM154.403 18.1819H163.494V27.2728H154.403V18.1819ZM163.494 27.2728H172.585V36.3637H163.494V27.2728ZM163.494 36.3637H172.585V45.4546H163.494V36.3637ZM199.822 4.30346e-05H208.913V9.09095H199.822V4.30346e-05ZM190.732 4.30346e-05H199.822V9.09095H190.732V4.30346e-05ZM181.641 9.09095H190.732V18.1819H181.641V9.09095ZM181.641 18.1819H190.732V27.2728H181.641V18.1819ZM190.732 18.1819H199.822V27.2728H190.732V18.1819ZM199.822 18.1819H208.913V27.2728H199.822V18.1819ZM199.822 27.2728H208.913V36.3637H199.822V27.2728ZM199.822 36.3637H208.913V45.4546H199.822V36.3637ZM190.732 36.3637H199.822V45.4546H190.732V36.3637ZM181.641 36.3637H190.732V45.4546H181.641V36.3637ZM181.641 4.30346e-05H190.732V9.09095H181.641V4.30346e-05ZM217.969 4.30346e-05H227.06V9.09095H217.969V4.30346e-05ZM217.969 9.09095H227.06V18.1819H217.969V9.09095ZM217.969 18.1819H227.06V27.2728H217.969V18.1819ZM217.969 27.2728H227.06V36.3637H217.969V27.2728ZM217.969 36.3637H227.06V45.4546H217.969V36.3637ZM227.06 4.30346e-05H236.151V9.09095H227.06V4.30346e-05ZM227.06 36.3637H236.151V45.4546H227.06V36.3637ZM227.06 18.1819H236.151V27.2728H227.06V18.1819ZM236.151 4.30346e-05H245.241V9.09095H236.151V4.30346e-05ZM236.151 36.3637H245.241V45.4546H236.151V36.3637ZM254.297 4.30346e-05H263.388V9.09095H254.297V4.30346e-05ZM263.388 4.30346e-05H272.479V9.09095H263.388V4.30346e-05ZM272.479 4.30346e-05H281.57V9.09095H272.479V4.30346e-05ZM263.388 9.09095H272.479V18.1819H263.388V9.09095ZM263.388 18.1819H272.479V27.2728H263.388V18.1819ZM263.388 27.2728H272.479V36.3637H263.388V27.2728ZM263.388 36.3637H272.479V45.4546H263.388V36.3637Z"
								fill="currentColor"
							/>
						</svg>
					</div>

					{/* Drop Zone */}
					<button
						type="button"
						onClick={handleOpenProject}
						disabled={isLoading}
						className={cn(
							"relative w-full rounded-xl border-2 border-dashed transition-all duration-200",
							"flex flex-col items-center justify-center gap-4 py-16 px-8",
							"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							isDragOver
								? "border-primary bg-primary/5 scale-[1.02]"
								: "border-border hover:border-muted-foreground/50 hover:bg-accent/30",
							isLoading && "opacity-50 cursor-not-allowed",
						)}
					>
						<AnimatePresence mode="wait">
							{isLoading ? (
								<motion.div
									key="loading"
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									className="flex flex-col items-center gap-3"
								>
									<LuLoader className="h-8 w-8 text-muted-foreground animate-spin" />
									<span className="text-sm text-muted-foreground">
										Opening project...
									</span>
								</motion.div>
							) : (
								<motion.div
									key="default"
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									className="flex flex-col items-center gap-3"
								>
									<div
										className={cn(
											"rounded-full p-4 transition-colors",
											isDragOver ? "bg-primary/10" : "bg-muted",
										)}
									>
										<LuFolderOpen
											className={cn(
												"h-8 w-8 transition-colors",
												isDragOver ? "text-primary" : "text-muted-foreground",
											)}
										/>
									</div>
									<div className="text-center">
										<p
											className={cn(
												"text-sm font-medium transition-colors",
												isDragOver ? "text-primary" : "text-foreground",
											)}
										>
											{isDragOver
												? "Drop to open project"
												: "Drop a folder to get started"}
										</p>
										<p className="text-xs text-muted-foreground mt-1">
											or click to browse
										</p>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</button>

					{/* Clone repo link */}
					<button
						type="button"
						onClick={() => {
							setError(null);
							setIsCloneDialogOpen(true);
						}}
						disabled={isLoading}
						className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					>
						Clone from GitHub instead
					</button>

					{/* Error Display */}
					<AnimatePresence>
						{error && (
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								className="mt-4 w-full flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive"
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
				</div>
			</div>

			{/* Dialogs */}
			<CloneRepoDialog
				isOpen={isCloneDialogOpen}
				onClose={() => setIsCloneDialogOpen(false)}
				onError={setError}
			/>
			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>
		</div>
	);
}
