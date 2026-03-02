import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { LuFolderPlus, LuLoader, LuX } from "react-icons/lu";
import { useOpenProject } from "renderer/react-query/projects";

interface SidebarDropZoneProps {
	children: ReactNode;
	className?: string;
}

export function SidebarDropZone({ children, className }: SidebarDropZoneProps) {
	const navigate = useNavigate();
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { openFromPath, isPending } = useOpenProject();

	useEffect(() => {
		if (!error) return;

		const timer = setTimeout(() => {
			setError(null);
		}, 5000);

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

		// Ignore drag leaves to child elements
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
		async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			if (isPending) return;

			setError(null);

			const firstFile = Array.from(e.dataTransfer.files)[0];
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

			try {
				const project = await openFromPath(filePath);
				if (project) {
					navigate({
						to: "/project/$projectId",
						params: { projectId: project.id },
					});
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to open project");
			}
		},
		[openFromPath, isPending, navigate],
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

				{isPending && !isDragOver && (
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
		</div>
	);
}
