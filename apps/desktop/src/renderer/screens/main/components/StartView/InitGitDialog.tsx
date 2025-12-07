import { Button } from "@superset/ui/button";
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

	const handleInitGit = async () => {
		if (isLoading) return; // Prevent double-clicks

		let result: Awaited<ReturnType<typeof initGitAndOpen.mutateAsync>>;
		try {
			result = await initGitAndOpen.mutateAsync({ path: selectedPath });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Unknown error";
			onError(`Failed to initialize git repository: ${message}`);
			return;
		}

		if (!result.project) {
			onError("Unexpected error: project was not created");
			return;
		}

		// Invalidate cache in background - don't block the primary workflow
		utils.projects.getRecents.invalidate();

		try {
			await createWorkspace.mutateAsync({ projectId: result.project.id });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Unknown error";
			onError(`Failed to create workspace: ${message}`);
			return;
		}

		onClose();
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
					<Button variant="outline" onClick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button onClick={handleInitGit} disabled={isLoading}>
						{isLoading ? "Initializing..." : "Initialize Git"}
					</Button>
				</div>
			</div>
		</div>
	);
}
