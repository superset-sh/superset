import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

function getBasename(path: string): string {
	// Handle both Unix and Windows paths
	const normalized = path.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	return segments[segments.length - 1] || path;
}

interface InitGitDialogProps {
	isOpen: boolean;
	selectedPath: string;
	onClose: () => void;
	onError: (error: string) => void;
}

export function InitGitDialog({
	isOpen,
	selectedPath,
	onClose,
	onError,
}: InitGitDialogProps) {
	const utils = trpc.useUtils();
	const initGitAndOpen = trpc.projects.initGitAndOpen.useMutation();
	const createWorkspace = useCreateWorkspace();

	const isLoading = initGitAndOpen.isPending || createWorkspace.isPending;

	// Handle Escape key to close dialog
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isLoading) {
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, isLoading, onClose]);

	const handleBackdropClick = (e: React.MouseEvent) => {
		// Only close if clicking the backdrop, not the dialog content
		if (e.target === e.currentTarget && !isLoading) {
			onClose();
		}
	};

	const handleInitGit = () => {
		if (isLoading) return; // Prevent double-clicks
		initGitAndOpen.mutate(
			{ path: selectedPath },
			{
				onSuccess: (result) => {
					if (result.project) {
						utils.projects.getRecents.invalidate();
						createWorkspace.mutate({ projectId: result.project.id });
						onClose();
					} else {
						onError("Unexpected error: project was not created");
					}
				},
				onError: (err) => {
					onError(err.message || "Failed to initialize git repository");
				},
			},
		);
	};

	if (!isOpen) return null;

	const folderName = getBasename(selectedPath);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Modal backdrop dismiss pattern
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
			onClick={handleBackdropClick}
		>
			<div className="bg-card border border-border rounded-lg p-8 w-full max-w-md shadow-2xl">
				<h2 className="text-xl font-normal text-foreground mb-4">
					Initialize Git Repository
				</h2>

				<p className="text-sm text-muted-foreground mb-2">
					The selected folder is not a git repository:
				</p>

				<div className="bg-background border border-border rounded-md px-3 py-2 mb-6">
					<span className="text-sm text-foreground font-mono">
						{folderName}
					</span>
					<span className="text-xs text-muted-foreground block mt-1 break-all">
						{selectedPath}
					</span>
				</div>

				<p className="text-sm text-muted-foreground mb-6">
					Would you like to initialize a git repository in this folder?
				</p>

				<div className="flex gap-3 justify-end">
					<button
						type="button"
						onClick={onClose}
						disabled={isLoading}
						className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleInitGit}
						disabled={isLoading}
						className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
					>
						{isLoading ? "Initializing..." : "Initialize Git"}
					</button>
				</div>
			</div>
		</div>
	);
}
