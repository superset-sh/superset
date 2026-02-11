import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

function getBasename(path: string): string {
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
	/** Additional paths that need git init (multi-select). */
	selectedPaths?: string[];
	onClose: () => void;
	onError: (error: string) => void;
}

export function InitGitDialog({
	isOpen,
	selectedPath,
	selectedPaths,
	onClose,
	onError,
}: InitGitDialogProps) {
	const allPaths =
		selectedPaths && selectedPaths.length > 0
			? selectedPaths
			: selectedPath
				? [selectedPath]
				: [];
	const utils = electronTrpc.useUtils();
	const initGitAndOpen = electronTrpc.projects.initGitAndOpen.useMutation();
	const createWorkspace = useCreateWorkspace();

	const [isProcessing, setIsProcessing] = useState(false);

	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const titleId = useId();

	const dialogRef = useRef<HTMLDivElement>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (isOpen) {
			previouslyFocusedRef.current = document.activeElement as HTMLElement;
			requestAnimationFrame(() => {
				const firstFocusable =
					dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
				firstFocusable?.focus();
			});
		} else {
			previouslyFocusedRef.current?.focus();
			previouslyFocusedRef.current = null;
		}
	}, [isOpen]);

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
		if (e.target === e.currentTarget && !isProcessing) {
			onClose();
		}
	};

	const handleInitGit = async () => {
		if (isProcessing) return;
		setIsProcessing(true);

		const errors: string[] = [];

		try {
			for (const path of allPaths) {
				let result: Awaited<ReturnType<typeof initGitAndOpen.mutateAsync>>;
				try {
					result = await initGitAndOpen.mutateAsync({ path });
				} catch (err) {
					errors.push(`${getBasename(path)}: ${getErrorMessage(err)}`);
					continue;
				}

				if (!result.project) {
					errors.push(`${getBasename(path)}: project was not created`);
					continue;
				}

				try {
					await createWorkspace.mutateAsync({ projectId: result.project.id });
				} catch (err) {
					errors.push(`${getBasename(path)}: ${getErrorMessage(err)}`);
				}
			}

			utils.projects.getRecents.invalidate().catch(console.error);

			if (errors.length > 0) {
				onError(
					`Failed to initialize ${errors.length} folder(s): ${errors.join("; ")}`,
				);
			}

			onClose();
		} finally {
			if (isMountedRef.current) {
				setIsProcessing(false);
			}
		}
	};

	if (!isOpen || allPaths.length === 0) return null;

	const isMultiple = allPaths.length > 1;

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
					Initialize Git {isMultiple ? "Repositories" : "Repository"}
				</h2>

				<p className="text-sm text-muted-foreground mb-2">
					{isMultiple
						? `${allPaths.length} selected folders are not git repositories:`
						: "The selected folder is not a git repository:"}
				</p>

				<div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
					{allPaths.map((path) => (
						<div
							key={path}
							className="bg-background border border-border rounded-md px-3 py-2"
						>
							<span className="text-sm text-foreground font-mono">
								{getBasename(path)}
							</span>
							<span className="text-xs text-muted-foreground block mt-1 break-all">
								{path}
							</span>
						</div>
					))}
				</div>

				<p className="text-sm text-muted-foreground mb-6">
					Would you like to initialize{" "}
					{isMultiple
						? "git repositories in these folders"
						: "a git repository in this folder"}
					?
				</p>

				<div className="flex gap-3 justify-end">
					<Button variant="outline" onClick={onClose} disabled={isProcessing}>
						Cancel
					</Button>
					<Button onClick={handleInitGit} disabled={isProcessing}>
						{isProcessing
							? "Initializing..."
							: `Initialize Git${isMultiple ? ` (${allPaths.length})` : ""}`}
					</Button>
				</div>
			</div>
		</div>
	);
}
