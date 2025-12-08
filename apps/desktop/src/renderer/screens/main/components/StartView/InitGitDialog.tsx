import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

function getBasename(path: string): string {
	// Handle both Unix and Windows paths
	const normalized = path.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	return segments[segments.length - 1] || path;
}

function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : "Unknown error";
}

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

	// Track the entire async sequence to keep modal locked
	const [isProcessing, setIsProcessing] = useState(false);

	// Guard against setState after unmount
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	// Accessibility: unique ID for aria-labelledby
	const titleId = useId();

	// Focus management refs
	const dialogRef = useRef<HTMLDivElement>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);

	// Save previous focus and move focus into dialog when opening
	useEffect(() => {
		if (isOpen) {
			previouslyFocusedRef.current = document.activeElement as HTMLElement;
			// Move focus to the first focusable element in the dialog
			requestAnimationFrame(() => {
				const firstFocusable =
					dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
				firstFocusable?.focus();
			});
		} else {
			// Restore focus when closing
			previouslyFocusedRef.current?.focus();
			previouslyFocusedRef.current = null;
		}
	}, [isOpen]);

	// Focus trap: cycle focus within the dialog
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape" && !isProcessing) {
				onClose();
				return;
			}

			if (e.key !== "Tab") return;

			const focusableElements =
				dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (e.shiftKey && document.activeElement === firstElement) {
				e.preventDefault();
				lastElement.focus();
			} else if (!e.shiftKey && document.activeElement === lastElement) {
				e.preventDefault();
				firstElement.focus();
			}
		},
		[isProcessing, onClose],
	);

	const handleBackdropClick = (e: React.MouseEvent) => {
		// Only close if clicking the backdrop, not the dialog content
		if (e.target === e.currentTarget && !isProcessing) {
			onClose();
		}
	};

	const handleInitGit = async () => {
		if (isProcessing) return; // Prevent double-clicks
		setIsProcessing(true);

		try {
			let result: Awaited<ReturnType<typeof initGitAndOpen.mutateAsync>>;
			try {
				result = await initGitAndOpen.mutateAsync({ path: selectedPath });
			} catch (err) {
				onError(`Failed to initialize git repository: ${getErrorMessage(err)}`);
				return;
			}

			if (!result.project) {
				onError("Unexpected error: project was not created");
				return;
			}

			// Invalidate cache in background - don't block the primary workflow
			utils.projects.getRecents.invalidate().catch(console.error);

			try {
				await createWorkspace.mutateAsync({ projectId: result.project.id });
			} catch (err) {
				onError(`Failed to create workspace: ${getErrorMessage(err)}`);
				return;
			}

			onClose();
		} finally {
			if (isMountedRef.current) {
				setIsProcessing(false);
			}
		}
	};

	if (!isOpen) return null;

	const folderName = getBasename(selectedPath);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Modal backdrop dismiss pattern
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
			onClick={handleBackdropClick}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				onKeyDown={handleKeyDown}
				className="bg-card border border-border rounded-lg p-8 w-full max-w-md shadow-2xl"
			>
				<h2 id={titleId} className="text-xl font-normal text-foreground mb-4">
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
					<Button variant="outline" onClick={onClose} disabled={isProcessing}>
						Cancel
					</Button>
					<Button onClick={handleInitGit} disabled={isProcessing}>
						{isProcessing ? "Initializing..." : "Initialize Git"}
					</Button>
				</div>
			</div>
		</div>
	);
}
