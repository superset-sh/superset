import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { LuFolderPlus, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderDrop } from "./useFolderDrop";
import { DROP_OVERLAY_INSET_PX, dropOverlayRadiusPx } from "./windowCorner";

interface WindowDropZoneProps {
	children: ReactNode;
	className?: string;
}

/**
 * Wraps the app shell so a Git repo folder can be dragged in from Finder/
 * Explorer and dropped anywhere in the window to open it as a project.
 */
export function WindowDropZone({ children, className }: WindowDropZoneProps) {
	const { isDragOver, isPending, dropHandlers } = useFolderDrop();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();

	return (
		<div className={cn("relative h-full w-full", className)} {...dropHandlers}>
			{children}

			<AnimatePresence>
				{isDragOver && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						// Inset the dashed border and match its radius to the OS window
						// corner so the two corners stay concentric.
						style={{
							margin: DROP_OVERLAY_INSET_PX,
							borderRadius: dropOverlayRadiusPx(platform),
						}}
						className="pointer-events-none absolute inset-0 z-[100] flex flex-col items-center justify-center border-2 border-dashed border-primary/60 bg-primary/5 backdrop-blur-sm"
					>
						<motion.div
							initial={{ scale: 0.9, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.9, opacity: 0 }}
							transition={{ duration: 0.15, delay: 0.05 }}
							className="flex flex-col items-center gap-3"
						>
							<div className="rounded-full bg-primary/10 p-4">
								<LuFolderPlus className="h-7 w-7 text-primary" />
							</div>
							<div className="text-center">
								<p className="text-base font-medium text-primary">
									Drop to open folder
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									Release to open the folder as a workspace
								</p>
							</div>
						</motion.div>
					</motion.div>
				)}

				{isPending && !isDragOver && (
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 8 }}
						transition={{ duration: 0.15 }}
						className="pointer-events-none absolute bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2 shadow-md backdrop-blur-sm"
					>
						<LuLoader className="h-4 w-4 text-muted-foreground animate-spin" />
						<span className="text-sm text-muted-foreground">
							Opening folder…
						</span>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
