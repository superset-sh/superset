import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuCheck, LuCircle, LuGitBranch, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useHasWorkspaceFailed,
	useWorkspaceInitProgress,
} from "renderer/stores/workspace-init";
import {
	INIT_STEP_MESSAGES,
	INIT_STEP_ORDER,
	isStepComplete,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";

interface WorkspaceInitializingViewProps {
	workspaceId: string;
	workspaceName: string;
	/** True if init was interrupted (e.g., app restart during init) */
	isInterrupted?: boolean;
}

// Steps to display in the progress view (skip pending and ready)
const DISPLAY_STEPS: WorkspaceInitStep[] = INIT_STEP_ORDER.filter(
	(step) => step !== "pending" && step !== "ready",
);

export function WorkspaceInitializingView({
	workspaceId,
	workspaceName,
	isInterrupted = false,
}: WorkspaceInitializingViewProps) {
	const progress = useWorkspaceInitProgress(workspaceId);
	const hasFailed = useHasWorkspaceFailed(workspaceId);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Delay showing the interrupted UI to avoid flash during normal creation.
	// If progress arrives within 500ms, we never show the interrupted state.
	const [showInterruptedUI, setShowInterruptedUI] = useState(false);
	useEffect(() => {
		if (isInterrupted && !progress) {
			const timer = setTimeout(() => setShowInterruptedUI(true), 500);
			return () => clearTimeout(timer);
		}
		setShowInterruptedUI(false);
	}, [isInterrupted, progress]);

	const retryMutation = electronTrpc.workspaces.retryInit.useMutation();
	const deleteMutation = electronTrpc.workspaces.delete.useMutation();
	const utils = electronTrpc.useUtils();

	const handleRetry = () => {
		retryMutation.mutate(
			{ workspaceId },
			{
				onSuccess: () => {
					utils.workspaces.invalidate();
				},
			},
		);
	};

	const handleDelete = () => {
		setShowDeleteConfirm(false);
		deleteMutation.mutate(
			{ id: workspaceId },
			{
				onSuccess: () => {
					utils.workspaces.invalidate();
				},
			},
		);
	};

	const currentStep = progress?.step ?? "pending";

	// Interrupted state (app restart during init - no in-memory progress)
	// Only show after delay to avoid flash during normal creation
	if (isInterrupted && !progress && showInterruptedUI) {
		return (
			<>
				<div className="flex flex-col items-center justify-center h-full w-full px-8">
					<div className="flex flex-col items-center max-w-sm text-center space-y-6">
						{/* Icon */}
						<div className="flex items-center justify-center size-16 rounded-full bg-muted">
							<LuGitBranch className="size-8 text-muted-foreground" />
						</div>

						{/* Title and description */}
						<div className="space-y-2">
							<h2 className="text-lg font-medium text-foreground">
								Setup incomplete
							</h2>
							<p className="text-sm text-muted-foreground">{workspaceName}</p>
							<p className="text-xs text-muted-foreground/80 mt-2">
								Workspace setup didn't finish. You can retry or remove it.
							</p>
						</div>

						{/* Action buttons */}
						<div className="flex gap-3">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowDeleteConfirm(true)}
								disabled={deleteMutation.isPending}
							>
								{deleteMutation.isPending ? "Deleting..." : "Delete Workspace"}
							</Button>
							<Button
								size="sm"
								onClick={handleRetry}
								disabled={retryMutation.isPending}
							>
								{retryMutation.isPending ? (
									<>
										<LuLoader className="mr-2 size-4 animate-spin" />
										Retrying...
									</>
								) : (
									"Retry Setup"
								)}
							</Button>
						</div>
					</div>
				</div>

				{/* Delete confirmation dialog */}
				<AlertDialog
					open={showDeleteConfirm}
					onOpenChange={setShowDeleteConfirm}
				>
					<AlertDialogContent className="max-w-[340px] gap-0 p-0">
						<AlertDialogHeader className="px-4 pt-4 pb-2">
							<AlertDialogTitle className="font-medium">
								Delete workspace "{workspaceName}"?
							</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="text-muted-foreground">
									This workspace was not fully set up. Deleting will clean up
									any partial files that were created.
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={() => setShowDeleteConfirm(false)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
							>
								Delete
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		);
	}

	// Failed state
	if (hasFailed) {
		return (
			<>
				<div className="flex flex-col items-center justify-center h-full w-full px-8">
					<div className="flex flex-col items-center max-w-sm text-center space-y-6">
						{/* Error icon */}
						<div className="flex items-center justify-center size-16 rounded-full bg-destructive/10">
							<HiExclamationTriangle className="size-8 text-destructive" />
						</div>

						{/* Title and description */}
						<div className="space-y-2">
							<h2 className="text-lg font-medium text-foreground">
								Workspace setup failed
							</h2>
							<p className="text-sm text-muted-foreground">{workspaceName}</p>
							{progress?.error && (
								<p className="text-xs text-destructive/80 mt-2 bg-destructive/5 rounded-md px-3 py-2 select-text cursor-text break-words">
									{progress.error}
								</p>
							)}
						</div>

						{/* Action buttons */}
						<div className="flex gap-3">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowDeleteConfirm(true)}
								disabled={deleteMutation.isPending}
							>
								{deleteMutation.isPending ? "Deleting..." : "Delete Workspace"}
							</Button>
							<Button
								size="sm"
								onClick={handleRetry}
								disabled={retryMutation.isPending}
							>
								{retryMutation.isPending ? (
									<>
										<LuLoader className="mr-2 size-4 animate-spin" />
										Retrying...
									</>
								) : (
									"Retry"
								)}
							</Button>
						</div>
					</div>
				</div>

				{/* Delete confirmation dialog */}
				<AlertDialog
					open={showDeleteConfirm}
					onOpenChange={setShowDeleteConfirm}
				>
					<AlertDialogContent className="max-w-[340px] gap-0 p-0">
						<AlertDialogHeader className="px-4 pt-4 pb-2">
							<AlertDialogTitle className="font-medium">
								Delete workspace "{workspaceName}"?
							</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="text-muted-foreground">
									This workspace failed to initialize. Deleting will clean up
									any partial files that were created.
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={() => setShowDeleteConfirm(false)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
							>
								Delete
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		);
	}

	// Initializing state
	return (
		<div className="flex flex-col items-center justify-center h-full w-full px-8">
			<div className="flex flex-col items-center max-w-sm text-center space-y-6">
				{/* Icon with pulse animation */}
				<div className="relative">
					<div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
					<div className="relative flex items-center justify-center size-16 rounded-full bg-primary/10">
						<LuGitBranch className="size-8 text-primary" />
					</div>
				</div>

				{/* Title and description */}
				<div className="space-y-2">
					<h2 className="text-lg font-medium text-foreground">
						Setting up workspace
					</h2>
					<p className="text-sm text-muted-foreground">{workspaceName}</p>
				</div>

				{/* Step list */}
				<div className="w-full space-y-2">
					{DISPLAY_STEPS.map((step) => {
						const isComplete = isStepComplete(step, currentStep);
						const isCurrent = step === currentStep;

						return (
							<div
								key={step}
								className={cn(
									"flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
									isComplete && "bg-muted/30",
									isCurrent && "bg-primary/5",
								)}
							>
								{/* Step icon */}
								{isComplete ? (
									<LuCheck className="size-4 text-green-500 shrink-0" />
								) : isCurrent ? (
									<LuLoader className="size-4 text-primary animate-spin shrink-0" />
								) : (
									<LuCircle className="size-4 text-muted-foreground/40 shrink-0" />
								)}

								{/* Step label */}
								<span
									className={cn(
										"text-left flex-1",
										isComplete && "text-muted-foreground line-through",
										isCurrent && "text-foreground font-medium",
										!isComplete && !isCurrent && "text-muted-foreground/60",
									)}
								>
									{INIT_STEP_MESSAGES[step]}
								</span>
							</div>
						);
					})}
				</div>

				{/* Helper text */}
				<p className="text-xs text-muted-foreground/60">
					Takes 10s to a few minutes depending on the size of your repo
				</p>
			</div>
		</div>
	);
}
